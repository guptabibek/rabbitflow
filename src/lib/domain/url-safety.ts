import { lookup } from 'node:dns/promises'
import net from 'node:net'

/**
 * SSRF guard for outbound URLs supplied by users (webhook endpoints).
 *
 * A webhook URL was previously validated only by `z.string().url()`, and the
 * dispatcher stored up to 4 KB of the response body — which the webhook
 * management UI renders. That combination gave any project admin an arbitrary
 * HTTP read primitive against everything the container can reach: the cloud
 * metadata service, and every service on the compose `internal` network.
 */

const ALLOWED_PROTOCOLS = new Set(['http:', 'https:'])

/**
 * Permit plain http only for explicitly configured internal hosts (a webhook
 * receiver on the same network, for example). Empty by default.
 */
const ALLOWED_INSECURE_HOSTS = (process.env.WEBHOOK_ALLOWED_INSECURE_HOSTS || '')
  .split(',')
  .map((host) => host.trim().toLowerCase())
  .filter(Boolean)

/** Escape hatch for self-hosted deployments that genuinely target private ranges. */
const ALLOW_PRIVATE_TARGETS = process.env.WEBHOOK_ALLOW_PRIVATE_TARGETS === 'true'

export type UrlSafetyResult = { ok: true; url: URL } | { ok: false; reason: string }

function ipv4ToParts(address: string): number[] | null {
  const parts = address.split('.').map((part) => Number.parseInt(part, 10))
  if (parts.length !== 4 || parts.some((part) => Number.isNaN(part))) return null
  return parts
}

/**
 * True for addresses that must never be reachable from a user-supplied URL:
 * loopback, RFC-1918 private space, link-local (including the 169.254.169.254
 * cloud metadata endpoint), carrier-grade NAT, broadcast and reserved ranges.
 */
export function isBlockedIpAddress(address: string): boolean {
  const version = net.isIP(address)

  if (version === 4) {
    const parts = ipv4ToParts(address)
    if (!parts) return true
    const [a, b] = parts

    if (a === 0) return true // "this" network
    if (a === 10) return true // RFC 1918
    if (a === 127) return true // loopback
    if (a === 169 && b === 254) return true // link-local, incl. cloud metadata
    if (a === 172 && b >= 16 && b <= 31) return true // RFC 1918
    if (a === 192 && b === 168) return true // RFC 1918
    if (a === 100 && b >= 64 && b <= 127) return true // CGNAT
    if (a === 192 && b === 0) return true // IETF protocol assignments
    if (a >= 224) return true // multicast, reserved, broadcast

    return false
  }

  if (version === 6) {
    const normalized = address.toLowerCase()

    if (normalized === '::' || normalized === '::1') return true // unspecified, loopback
    if (normalized.startsWith('fe80')) return true // link-local
    if (normalized.startsWith('fc') || normalized.startsWith('fd')) return true // unique local
    if (normalized.startsWith('ff')) return true // multicast

    // IPv4-mapped (::ffff:a.b.c.d) and IPv4-compatible forms must be judged by
    // the embedded IPv4 address, otherwise they bypass the checks above.
    const embedded = normalized.split(':').pop() ?? ''
    if (net.isIP(embedded) === 4) {
      return isBlockedIpAddress(embedded)
    }

    return false
  }

  // Not an IP literal.
  return false
}

/**
 * Validate a user-supplied outbound URL: scheme, credential-free, and resolving
 * to a public address.
 *
 * Note: this reduces but does not eliminate DNS-rebinding risk, since the name is
 * resolved here and again by `fetch`. Pair with a short timeout and no redirect
 * following, both of which the webhook dispatcher does.
 */
export async function assertSafeOutboundUrl(rawUrl: string): Promise<UrlSafetyResult> {
  let url: URL
  try {
    url = new URL(rawUrl)
  } catch {
    return { ok: false, reason: 'Webhook URL is not a valid URL' }
  }

  if (!ALLOWED_PROTOCOLS.has(url.protocol)) {
    return { ok: false, reason: 'Webhook URL must use http or https' }
  }

  const hostname = url.hostname.toLowerCase()

  if (
    url.protocol === 'http:' &&
    !ALLOWED_INSECURE_HOSTS.includes(hostname) &&
    !ALLOW_PRIVATE_TARGETS
  ) {
    return {
      ok: false,
      reason: 'Webhook URL must use https (plain http is allowed only for configured hosts)',
    }
  }

  // Embedded credentials would be forwarded to the target on every delivery.
  if (url.username || url.password) {
    return { ok: false, reason: 'Webhook URL must not contain embedded credentials' }
  }

  if (ALLOW_PRIVATE_TARGETS) {
    return { ok: true, url }
  }

  // Reject obvious internal names before spending a DNS lookup on them.
  if (hostname === 'localhost' || hostname.endsWith('.localhost') || hostname.endsWith('.internal')) {
    return { ok: false, reason: 'Webhook URL must not target an internal host' }
  }

  if (net.isIP(hostname) && isBlockedIpAddress(hostname)) {
    return { ok: false, reason: 'Webhook URL must not target a private or reserved address' }
  }

  try {
    const resolved = await lookup(hostname, { all: true })
    if (resolved.length === 0) {
      return { ok: false, reason: 'Webhook host could not be resolved' }
    }

    // Every address the name resolves to must be public — a name with one public
    // and one private record would otherwise still reach the private one.
    for (const entry of resolved) {
      if (isBlockedIpAddress(entry.address)) {
        return { ok: false, reason: 'Webhook URL resolves to a private or reserved address' }
      }
    }
  } catch {
    return { ok: false, reason: 'Webhook host could not be resolved' }
  }

  return { ok: true, url }
}
