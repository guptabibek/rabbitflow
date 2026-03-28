import path from 'node:path'

const defaultBaseUrl = 'http://127.0.0.1:3000'
const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'

export const E2E_BASE_URL =
  process.env.E2E_BASE_URL ?? process.env.PLAYWRIGHT_BASE_URL ?? defaultBaseUrl

export const E2E_PREFIX = process.env.E2E_PREFIX ?? 'E2E'
export const E2E_TEST_PASSWORD = process.env.E2E_PASSWORD ?? 'Passw0rd!23'

export const AUTH_DIR = path.join(process.cwd(), 'playwright', '.auth')

export const AUTH_STATES = {
  admin: path.join(AUTH_DIR, 'admin.json'),
  member: path.join(AUTH_DIR, 'member.json'),
  viewer: path.join(AUTH_DIR, 'viewer.json'),
} as const

export const TEST_ACCOUNTS = {
  admin: {
    email: process.env.E2E_ADMIN_EMAIL ?? 'e2e-admin@rabbitflow.local',
    name: process.env.E2E_ADMIN_NAME ?? 'E2E Admin',
    globalRole: 'admin' as const,
  },
  member: {
    email: process.env.E2E_MEMBER_EMAIL ?? 'e2e-member@rabbitflow.local',
    name: process.env.E2E_MEMBER_NAME ?? 'E2E Member',
    globalRole: 'member' as const,
  },
  viewer: {
    email: process.env.E2E_VIEWER_EMAIL ?? 'e2e-viewer@rabbitflow.local',
    name: process.env.E2E_VIEWER_NAME ?? 'E2E Viewer',
    globalRole: 'member' as const,
  },
} as const

function sanitizeSegment(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 24)
}

export function shortToken() {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`.toUpperCase()
}

function randomLetters(length: number) {
  return Array.from({ length }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join('')
}

export function makeProjectName(label: string) {
  const segment = sanitizeSegment(label) || 'project'
  return `${E2E_PREFIX}-${segment}-${shortToken()}`
}

export function makeProjectKey() {
  return `${E2E_PREFIX}${randomLetters(6)}`.replace(/[^A-Z]/g, '').slice(0, 10)
}

export function makeIssueTitle(label: string) {
  const segment = sanitizeSegment(label) || 'issue'
  return `${E2E_PREFIX}: ${segment} ${shortToken()}`
}

export function makeNotificationTitle(label: string) {
  const segment = sanitizeSegment(label) || 'notification'
  return `${E2E_PREFIX}: ${segment} ${shortToken()}`
}

export function makeSignupEmail(label = 'signup') {
  const segment = sanitizeSegment(label) || 'signup'
  return `${segment}.${shortToken().toLowerCase()}@rabbitflow.local`
}