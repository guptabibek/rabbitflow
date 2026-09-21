import test from 'node:test'
import assert from 'node:assert/strict'
import { isBlockedIpAddress } from '../../src/lib/domain/url-safety.ts'

/**
 * Regression tests for SEC-006.
 *
 * Webhook URLs were validated only by `z.string().url()`, and the dispatcher
 * stored 4 KB of the response body — which the management UI renders. A project
 * admin therefore had an arbitrary HTTP read primitive against the cloud
 * metadata service and every host on the internal Docker network.
 */

test('SEC-006: cloud metadata endpoint is blocked', () => {
  // The single most valuable SSRF target: returns cloud credentials.
  assert.equal(isBlockedIpAddress('169.254.169.254'), true)
  assert.equal(isBlockedIpAddress('169.254.0.1'), true)
})

test('SEC-006: loopback is blocked', () => {
  assert.equal(isBlockedIpAddress('127.0.0.1'), true)
  assert.equal(isBlockedIpAddress('127.1.2.3'), true)
  assert.equal(isBlockedIpAddress('::1'), true)
})

test('SEC-006: RFC 1918 private ranges are blocked', () => {
  assert.equal(isBlockedIpAddress('10.0.0.1'), true)
  assert.equal(isBlockedIpAddress('192.168.1.1'), true)
  assert.equal(isBlockedIpAddress('172.16.0.1'), true)
  assert.equal(isBlockedIpAddress('172.31.255.255'), true)
})

test('SEC-006: addresses adjacent to private ranges are still allowed', () => {
  // 172.15 and 172.32 sit outside the 172.16–172.31 block; an off-by-one here
  // would either open a hole or break legitimate public endpoints.
  assert.equal(isBlockedIpAddress('172.15.0.1'), false)
  assert.equal(isBlockedIpAddress('172.32.0.1'), false)
  assert.equal(isBlockedIpAddress('11.0.0.1'), false)
  assert.equal(isBlockedIpAddress('192.169.1.1'), false)
})

test('SEC-006: carrier-grade NAT and reserved ranges are blocked', () => {
  assert.equal(isBlockedIpAddress('100.64.0.1'), true)
  assert.equal(isBlockedIpAddress('0.0.0.0'), true)
  assert.equal(isBlockedIpAddress('224.0.0.1'), true) // multicast
  assert.equal(isBlockedIpAddress('255.255.255.255'), true) // broadcast
})

test('SEC-006: IPv4-mapped IPv6 cannot smuggle a private address', () => {
  // ::ffff:169.254.169.254 reaches the metadata service while looking like IPv6.
  assert.equal(isBlockedIpAddress('::ffff:169.254.169.254'), true)
  assert.equal(isBlockedIpAddress('::ffff:127.0.0.1'), true)
  assert.equal(isBlockedIpAddress('::ffff:10.0.0.1'), true)
})

test('SEC-006: IPv6 link-local, unique-local and multicast are blocked', () => {
  assert.equal(isBlockedIpAddress('fe80::1'), true)
  assert.equal(isBlockedIpAddress('fd00::1'), true)
  assert.equal(isBlockedIpAddress('fc00::1'), true)
  assert.equal(isBlockedIpAddress('ff02::1'), true)
  assert.equal(isBlockedIpAddress('::'), true)
})

test('SEC-006: ordinary public addresses remain reachable', () => {
  assert.equal(isBlockedIpAddress('8.8.8.8'), false)
  assert.equal(isBlockedIpAddress('1.1.1.1'), false)
  assert.equal(isBlockedIpAddress('93.184.216.34'), false)
  assert.equal(isBlockedIpAddress('2606:4700:4700::1111'), false)
})

test('SEC-006: hostnames are not treated as addresses', () => {
  // Names are resolved separately; this function only judges IP literals.
  assert.equal(isBlockedIpAddress('example.com'), false)
  assert.equal(isBlockedIpAddress('not-an-ip'), false)
})
