import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
function fixture(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'rabbitflow-site-test-'))
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }))
  return directory
}
function build(directory, origin) {
  const env = { ...process.env }
  delete env.SITE_URL
  if (origin) env.SITE_URL = origin
  return spawnSync(process.execPath, [path.join(root, 'scripts/build-marketing.mjs'), directory], { env, encoding: 'utf8' })
}

test('unconfigured evaluation builds cannot advertise an indexing origin', t => {
  const output = fixture(t)
  assert.equal(build(output).status, 0)
  const html = fs.readFileSync(path.join(output, 'index.html'), 'utf8')
  assert.match(html, /noindex,nofollow/)
  assert.doesNotMatch(html, /rel="canonical"/)
  assert.equal(fs.existsSync(path.join(output, 'sitemap.xml')), false)
  assert.equal(fs.readFileSync(path.join(output, 'robots.txt'), 'utf8'), 'User-agent: *\nDisallow: /\n')
  assert.ok(fs.statSync(path.join(output, 'assets/rabbitflow-mark.png')).size > 0)
})

test('an explicit HTTPS origin produces consistent discoverability artifacts and can return to noindex', t => {
  const output = fixture(t)
  assert.equal(build(output, 'https://rabbitflow.example').status, 0)
  const html = fs.readFileSync(path.join(output, 'index.html'), 'utf8')
  assert.match(html, /index,follow/)
  assert.match(html, /rel="canonical" href="https:\/\/rabbitflow.example\/"/)
  assert.match(fs.readFileSync(path.join(output, 'sitemap.xml'), 'utf8'), /<loc>https:\/\/rabbitflow.example\/<\/loc>/)
  const json = JSON.parse(html.match(/<script type="application\/ld\+json">([^<]+)<\/script>/)[1])
  assert.equal(json.url, 'https://rabbitflow.example/')
  assert.equal(json.aggregateRating, undefined)
  assert.equal(build(output).status, 0)
  assert.equal(fs.existsSync(path.join(output, 'sitemap.xml')), false)
})

test('rejects insecure or ambiguous origins without producing a deployable build', t => {
  const output = fixture(t)
  for (const url of ['http://rabbitflow.example', 'https://localhost', 'https://rabbitflow.example/path', 'https://user:pass@rabbitflow.example']) {
    assert.notEqual(build(output, url).status, 0)
    assert.equal(fs.existsSync(path.join(output, 'index.html')), false)
  }
})

test('refuses to overwrite a directory containing unrelated user files', t => {
  const output = fixture(t)
  fs.writeFileSync(path.join(output, 'user.txt'), 'keep me')
  assert.notEqual(build(output).status, 0)
  assert.equal(fs.readFileSync(path.join(output, 'user.txt'), 'utf8'), 'keep me')
})

test('robots directives use real lines and sitemap XML contains no literal newline escapes', t => {
  const output = fixture(t)
  assert.equal(build(output, 'https://rabbitflow.example').status, 0)
  assert.equal(fs.readFileSync(path.join(output, 'robots.txt'), 'utf8'),
    'User-agent: *\nAllow: /\nSitemap: https://rabbitflow.example/sitemap.xml\n')
  assert.doesNotMatch(fs.readFileSync(path.join(output, 'sitemap.xml'), 'utf8'), /\\n/)
})

test('rejects checkout and symlink destinations without overwriting user data', t => {
  const directory = fixture(t)
  const target = path.join(directory, 'target')
  fs.mkdirSync(target)
  fs.writeFileSync(path.join(target, 'index.html'), 'private content')
  const alias = path.join(directory, 'alias')
  fs.symlinkSync(target, alias)
  assert.notEqual(build(alias).status, 0)
  assert.equal(fs.readFileSync(path.join(target, 'index.html'), 'utf8'), 'private content')
  assert.notEqual(build(path.join(root, 'public')).status, 0)
  const output = path.join(directory, 'build')
  assert.equal(build(output).status, 0)
  fs.symlinkSync(target, path.join(output, 'assets/linked'))
  assert.notEqual(build(output).status, 0)
  assert.equal(fs.readFileSync(path.join(target, 'index.html'), 'utf8'), 'private content')
})
