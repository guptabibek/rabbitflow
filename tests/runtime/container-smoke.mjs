// Creates a new isolated Compose project with synthetic data. Never accepts an
// existing DATABASE_URL and never removes volumes or resets a database.
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { authenticator } from 'otplib'

const directory = mkdtempSync(path.join(tmpdir(), 'rabbitflow-container-'))
const project = `rabbitflow-check-${randomBytes(5).toString('hex')}`
const secret = () => randomBytes(32).toString('hex')
const base = 'http://127.0.0.1:15400'
const config = {
  APP_DOMAIN: 'localhost', APP_URL: base, NGINX_PORT: '15400',
  APP_TRUSTED_PROXY_CIDR: '127.0.0.1/32',
  JWT_SECRET: secret(), CRON_SECRET: secret(), MFA_ENCRYPTION_KEY: secret(),
  POSTGRES_DB: 'rabbitflow_container_test', POSTGRES_USER: 'audit', POSTGRES_PASSWORD: secret(),
  REDIS_PASSWORD: secret(), RUN_BOOTSTRAP_SEED: 'true', MFA_REQUIRE_ENROLLMENT: 'true',
  SEED_ADMIN_EMAIL: 'container-check@example.invalid', SEED_ADMIN_NAME: 'Synthetic container check',
  SEED_ADMIN_PASSWORD: secret(), ALLOW_HEADER_AUTH: 'false', ALLOW_SELF_REGISTRATION: 'false',
  SMTP_HOST: '', SMTP_USER: '', SMTP_PASS: '', SMTP_FROM: '',
  POSTGRES_VOLUME_NAME: `${project}-postgres`, REDIS_VOLUME_NAME: `${project}-redis`, UPLOADS_VOLUME_NAME: `${project}-uploads`,
}
config.DATABASE_URL = `postgresql://audit:${config.POSTGRES_PASSWORD}@postgres:5432/${config.POSTGRES_DB}`
const envFile = path.join(directory, 'runtime.env')
const override = path.join(directory, 'compose.yml')
writeFileSync(envFile, Object.entries(config).map(([key, value]) => `${key}=${value}`).join('\n') + '\n', { mode: 0o600 })
writeFileSync(override, `services:
  app:
    image: rabbitflow:container-review
    build: null
  nginx:
    ports: !override
      - "127.0.0.1:15400:80"
`, { mode: 0o600 })
const composeArgs = ['compose', '-p', project, '-f', 'docker-compose.production.yml', '-f', override, '--env-file', envFile]
const command = (...args) => execFileSync('docker', [...composeArgs, ...args], { env: { ...process.env, ...config }, stdio: ['ignore', 'pipe', 'pipe'], timeout: 240_000 })
const post = (route, body, headers = {}) => fetch(base + route, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body), signal: AbortSignal.timeout(20_000) })
async function readiness() {
  const deadline = Date.now() + 90_000
  while (Date.now() < deadline) {
    try { if ((await fetch(base + '/api/health/ready', { signal: AbortSignal.timeout(5000) })).status === 200) return } catch { /* booting */ }
    await new Promise(resolve => setTimeout(resolve, 500))
  }
  throw new Error('Container readiness did not reach HTTP 200')
}
let cookie
async function signIn(seed) {
  const response = await post('/api/auth/login', { email: config.SEED_ADMIN_EMAIL, password: config.SEED_ADMIN_PASSWORD })
  assert.equal(response.status, 200)
  const challenge = await response.json()
  assert.equal(challenge.mfaRequired, true)
  assert.equal(response.headers.has('set-cookie'), false)
  const secret = seed ?? challenge.manualEntryKey
  assert.ok(secret)
  const verified = await post('/api/auth/mfa/verify', { challengeToken: challenge.challengeToken, code: authenticator.generate(secret) })
  assert.equal(verified.status, 200)
  cookie = verified.headers.get('set-cookie')?.match(/auth-token=[^;]+/)?.[0]
  assert.ok(cookie)
  return secret
}

try {
  command('up', '-d', '--no-build', '--wait', '--wait-timeout', '180', 'app', 'nginx', 'cron')
  await readiness()
  assert.equal(command('exec', '-T', 'app', 'id', '-u').toString().trim(), '999')
  command('exec', '-T', 'app', 'sh', '-c', 'test ! -e /usr/local/bin/npm')
  const seed = await signIn()
  assert.equal((await fetch(base + '/api/projects')).status, 401)
  const projectsResponse = await fetch(base + '/api/projects', { headers: { cookie } })
  assert.equal(projectsResponse.status, 200)
  const payload = await projectsResponse.json()
  const projects = Array.isArray(payload) ? payload : payload.projects
  assert.ok(projects.length)
  const created = await post('/api/issues', { projectId: projects[0].id, title: 'Synthetic container proof', workItemType: 'task', priority: 'medium', customFields: { scope: 'In Scope' } }, { cookie })
  assert.equal(created.status, 201)
  const issue = await created.json()
  const marker = 'Synthetic container attachment; no customer data.'
  const form = new FormData()
  form.set('issueId', issue.id)
  form.set('file', new File([marker], 'container-proof.txt', { type: 'text/plain' }))
  const uploaded = await fetch(base + '/api/attachments', { method: 'POST', headers: { cookie }, body: form })
  assert.equal(uploaded.status, 201)
  const attachment = await uploaded.json()
  const downloadPath = `/api/attachments/${attachment.id}`
  assert.equal(await (await fetch(base + downloadPath, { headers: { cookie } })).text(), marker)
  assert.equal((await fetch(base + downloadPath)).status, 401)
  assert.equal((await post('/api/auth/register', { email: 'uncreated@example.invalid', name: 'Synthetic', password: secret() })).status, 403)
  assert.equal((await post('/api/cron', {}, { 'x-cron-secret': config.CRON_SECRET })).status, 200)
  assert.equal((await post('/api/cron', {})).status, 401)
  const image = await fetch(base + '/_next/image?url=%2Fbrand%2Frabbitflow-mark.png&w=64&q=75')
  assert.equal(image.status, 200)
  assert.ok(image.headers.get('content-type')?.startsWith('image/'))
  assert.ok((await image.arrayBuffer()).byteLength > 0)
  command('restart', 'app')
  await readiness()
  assert.equal((await fetch(base + '/api/projects', { headers: { cookie } })).status, 200)
  assert.equal(await (await fetch(base + downloadPath, { headers: { cookie } })).text(), marker)
  await signIn(seed)
  console.log('Container checks passed: non-root startup/migrations/bootstrap, MFA, permissions, mutation, uploads, cron, Sharp and restart persistence.')
  if (process.env.GITHUB_ACTIONS === 'true') console.log('::notice title=Container runtime::Startup, migrations, MFA, permissions, uploads, cron, Sharp and restart persistence passed.')
} finally {
  try { command('down') } finally { rmSync(directory, { recursive: true, force: true }) }
}
