import test, { type TestContext } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync, execFile } from 'node:child_process'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { randomBytes } from 'node:crypto'
import { promisify } from 'node:util'
import { startSmtpFixture } from '../support/smtp-fixture.mjs'

const run = promisify(execFile)
async function fixture(t: TestContext, implicit: boolean, advertiseTls = true) {
  const directory = await mkdtemp(path.join(tmpdir(), 'rabbitflow-smtp-'))
  const key = path.join(directory, 'key.pem'), cert = path.join(directory, 'cert.pem')
  execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1', '-subj', '/CN=localhost', '-addext', 'subjectAltName=DNS:localhost,IP:127.0.0.1', '-keyout', key, '-out', cert], { stdio: 'ignore' })
  const username = 'synthetic', password = randomBytes(24).toString('hex')
  const smtp = await startSmtpFixture({ key: await readFile(key), cert: await readFile(cert), username, password, implicit, advertiseTls })
  t.after(async () => { await smtp.close(); await rm(directory, { recursive: true, force: true }) })
  const env: NodeJS.ProcessEnv = { ...process.env, NODE_ENV: 'production', NODE_EXTRA_CA_CERTS: cert, SMTP_HOST: '127.0.0.1', SMTP_PORT: String(smtp.port), SMTP_SECURE: String(implicit), SMTP_REQUIRE_TLS: 'true', SMTP_IGNORE_TLS: 'false', SMTP_TLS_REJECT_UNAUTHORIZED: 'true', SMTP_USER: username, SMTP_PASS: password, SMTP_FROM: 'RabbitFlow <sender@example.invalid>' }
  for (const name of ['REDIS_URL', 'REDIS_TLS_URL', 'REDIS_HOST', 'REDIS_PORT']) delete env[name]
  return { smtp, env }
}

for (const implicit of [true, false]) test(`email delivery and Redis-free fallback use authenticated ${implicit ? 'implicit TLS' : 'STARTTLS'}`, { timeout: 20_000 }, async t => {
  const { smtp, env } = await fixture(t, implicit)
  await run(process.execPath, ['--experimental-strip-types', '--import', './tests/support/alias-hooks.mjs', '-e', `
    (async()=>{
      const {sendEmail}=await import('./src/lib/email.ts');
      await sendEmail({to:'recipient@example.invalid',subject:'TLS transport check',text:'Synthetic delivery marker'});
      const {startEmailWorker,enqueueEmail}=await import('./src/lib/email-queue.ts');
      if(startEmailWorker()!==null)throw Error('Unconfigured Redis must not start a worker');
      await enqueueEmail({to:'recipient@example.invalid',subject:'Direct fallback check',text:'Synthetic fallback marker'});
    })().catch(e=>{console.error(e.message);process.exitCode=1});`], { env, timeout: 15_000 })
  assert.equal(smtp.messages.length, 2)
  assert.match(smtp.messages[0], /Synthetic delivery marker/)
  assert.match(smtp.messages[1], /Synthetic fallback marker/)
})

test('production SMTP refuses missing STARTTLS and unsafe TLS configuration', { timeout: 20_000 }, async t => {
  const { smtp, env } = await fixture(t, false, false)
  await run(process.execPath, ['--experimental-strip-types', '-e', `
    (async()=>{
      const {sendEmail}=await import('./src/lib/email.ts');
      const payload={to:'recipient@example.invalid',subject:'Refuse plaintext',text:'Never delivered'};
      try{await sendEmail(payload);throw Error('Delivered without TLS')}catch(e){if(e.message==='Delivered without TLS')throw e}
      for(const [key,value] of [['SMTP_IGNORE_TLS','true'],['SMTP_REQUIRE_TLS','false'],['SMTP_TLS_REJECT_UNAUTHORIZED','false']]){
        const before=process.env[key];process.env[key]=value;
        try{await sendEmail(payload);throw Error('Unsafe configuration accepted')}catch(e){if(!e.message.includes('Production SMTP requires verified TLS'))throw e}
        process.env[key]=before;
      }
    })().catch(e=>{console.error(e.message);process.exitCode=1});`], { env, timeout: 15_000 })
  assert.equal(smtp.messages.length, 0)
})

test('SMTP rejects an untrusted certificate instead of weakening verification', { timeout: 20_000 }, async t => {
  const { smtp, env } = await fixture(t, true)
  await run(process.execPath, ['--experimental-strip-types', '-e', `
    (async()=>{
      const {sendEmail}=await import('./src/lib/email.ts');
      try{await sendEmail({to:'recipient@example.invalid',subject:'Untrusted certificate',text:'Never delivered'});throw Error('Untrusted certificate accepted')}
      catch(e){if(e.message==='Untrusted certificate accepted')throw e}
    })().catch(e=>{console.error(e.message);process.exitCode=1});`], { env: { ...env, NODE_EXTRA_CA_CERTS: process.env.NODE_EXTRA_CA_CERTS || '' }, timeout: 15_000 })
  assert.equal(smtp.messages.length, 0)
})

test('configured Redis worker delivers queued email over verified TLS', { timeout: 20_000 }, async t => {
  assert.ok(process.env.REDIS_TEST_URL, 'REDIS_TEST_URL must point to an isolated test Redis')
  const { smtp, env } = await fixture(t, true)
  await run(process.execPath, ['--experimental-strip-types', '--import', './tests/support/alias-hooks.mjs', '-e', `
    (async()=>{
      const {startEmailWorker,enqueueEmail,closeEmailQueue}=await import('./src/lib/email-queue.ts');
      const worker=startEmailWorker();if(!worker)throw Error('Configured worker did not start');
      try{
        await worker.waitUntilReady();
        const done=new Promise((resolve,reject)=>{worker.once('completed',resolve);worker.once('failed',(_,error)=>reject(error));});
        await enqueueEmail({to:'recipient@example.invalid',subject:'Queued delivery',text:'Synthetic queued marker'});
        await done;
      }finally{await closeEmailQueue()}
    })().catch(e=>{console.error(e.message);process.exitCode=1});`], { env: { ...env, REDIS_URL: process.env.REDIS_TEST_URL }, timeout: 15_000 })
  assert.equal(smtp.messages.length, 1)
  assert.match(smtp.messages[0], /Synthetic queued marker/)
})
