import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'

/**
 * Authenticated encryption for secrets held at rest.
 *
 * TOTP seeds were stored in the clear in `User.mfaSecret`. Anyone who obtained a
 * database dump — a backup, a replica, an SQL-injection elsewhere, or the
 * unauthenticated Redis that used to be published to the host — could mint valid
 * second factors for every enrolled user indefinitely, without the password and
 * without leaving a trace.
 *
 * AES-256-GCM, so tampering is detected rather than silently decrypting to
 * garbage. Values are self-describing (`v1:iv:tag:ciphertext`) so the scheme can
 * be rotated later without guessing at the format.
 */

const VERSION = 'v1'
const ALGORITHM = 'aes-256-gcm'
const IV_BYTES = 12 // GCM standard
const KEY_BYTES = 32

let cachedKey: Buffer | null | undefined

/**
 * Derive the encryption key.
 *
 * `MFA_ENCRYPTION_KEY` should be 32 random bytes, base64 or hex encoded.
 * Anything else is hashed to the right length rather than rejected, so a
 * passphrase still yields a usable key — but the documented form is preferred.
 */
function getKey(): Buffer | null {
  if (cachedKey !== undefined) return cachedKey

  const configured = process.env.MFA_ENCRYPTION_KEY?.trim()

  if (!configured) {
    cachedKey = null
    return null
  }

  for (const encoding of ['base64', 'hex'] as const) {
    try {
      const decoded = Buffer.from(configured, encoding)
      if (decoded.length === KEY_BYTES) {
        cachedKey = decoded
        return cachedKey
      }
    } catch {
      // Try the next encoding.
    }
  }

  // Fall back to a digest so a passphrase of any length still produces a
  // well-formed key.
  cachedKey = createHash('sha256').update(configured, 'utf8').digest()
  return cachedKey
}

/** Whether at-rest encryption is configured. */
export function isSecretEncryptionEnabled(): boolean {
  return getKey() !== null
}

/** True when a stored value is already in the encrypted envelope format. */
export function isEncryptedValue(value: string): boolean {
  return value.startsWith(`${VERSION}:`)
}

/**
 * Encrypt a secret for storage.
 *
 * Returns the input unchanged when no key is configured, so an existing
 * deployment keeps working and can adopt encryption without a flag day —
 * `decryptSecret` reads both forms.
 */
export function encryptSecret(plaintext: string): string {
  const key = getKey()
  if (!key) return plaintext

  const iv = randomBytes(IV_BYTES)
  const cipher = createCipheriv(ALGORITHM, key, iv)
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const authTag = cipher.getAuthTag()

  return [
    VERSION,
    iv.toString('base64'),
    authTag.toString('base64'),
    ciphertext.toString('base64'),
  ].join(':')
}

/**
 * Decrypt a stored secret.
 *
 * A value without the envelope prefix predates encryption and is returned as-is,
 * so enrolled users are not locked out when the key is introduced. Re-encrypt
 * opportunistically on the next write (see `reencryptIfNeeded`).
 *
 * Returns null when an enveloped value cannot be decrypted — a wrong or rotated
 * key, or tampering. Callers must treat that as "no secret" rather than
 * crashing, so one bad row cannot take down sign-in for everyone.
 */
export function decryptSecret(stored: string): string | null {
  if (!isEncryptedValue(stored)) return stored

  const key = getKey()
  if (!key) {
    console.error(
      'A secret is stored encrypted but MFA_ENCRYPTION_KEY is not set; it cannot be read.'
    )
    return null
  }

  const [, ivPart, tagPart, dataPart] = stored.split(':')
  if (!ivPart || !tagPart || !dataPart) return null

  try {
    const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(ivPart, 'base64'))
    decipher.setAuthTag(Buffer.from(tagPart, 'base64'))
    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(dataPart, 'base64')),
      decipher.final(),
    ])
    return plaintext.toString('utf8')
  } catch {
    // Authentication failure: wrong key, or the value was modified.
    return null
  }
}

/**
 * Return an encrypted form when a stored value is still plaintext and a key is
 * available, or null when nothing needs to change. Lets callers upgrade rows
 * lazily as users sign in, rather than requiring a bulk migration.
 */
export function reencryptIfNeeded(stored: string): string | null {
  if (!isSecretEncryptionEnabled()) return null
  if (isEncryptedValue(stored)) return null
  return encryptSecret(stored)
}

/** Test seam: clears the memoised key after changing the environment. */
export function resetKeyCacheForTests(): void {
  cachedKey = undefined
}
