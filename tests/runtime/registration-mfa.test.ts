import test from 'node:test'
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { randomBytes } from 'node:crypto'

const run = promisify(execFile)

for (const required of [true, false]) {
  test(`opt-in registration ${required ? 'requires MFA before any session' : 'preserves explicitly disabled MFA behavior'}`, { timeout: 20_000 }, async () => {
    const database = process.env.TEST_DATABASE_URL
    assert.ok(database, 'TEST_DATABASE_URL must name a disposable database')
    assert.match(new URL(database).pathname, /test/i, 'refusing a non-test database')
    const env: NodeJS.ProcessEnv = { ...process.env, DATABASE_URL: database, NODE_ENV: 'production', ALLOW_SELF_REGISTRATION: 'true', MFA_REQUIRE_ENROLLMENT: String(required), JWT_SECRET: randomBytes(48).toString('hex'), MFA_ENCRYPTION_KEY: randomBytes(32).toString('hex') }
    for (const name of ['REDIS_URL', 'REDIS_TLS_URL', 'REDIS_HOST', 'REDIS_PORT']) delete env[name]
    await run(process.execPath, ['--experimental-strip-types', '--import', './tests/support/alias-hooks.mjs', '-e', `
      (async()=>{
        const assert=(await import('node:assert/strict')).default;
        const {PrismaClient}=await import('@prisma/client');const db=new PrismaClient();
        const {randomBytes}=await import('node:crypto');const {NextRequest}=await import('next/server.js');
        const email='registration-'+randomBytes(8).toString('hex')+'@example.invalid',password=randomBytes(20).toString('hex');
        const request=(path,body)=>new NextRequest('http://localhost'+path,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
        try{
          const {POST:register}=await import('./src/app/api/auth/register/route.ts');
          const response=await register(request('/api/auth/register',{email,password,name:'Synthetic registration'}));
          assert.equal(response.status,201);const payload=await response.json();
          if(process.env.MFA_REQUIRE_ENROLLMENT==='true'){
            assert.equal(payload.signInRequired,true);assert.equal(response.headers.has('set-cookie'),false);
            assert.equal(await db.authSession.count({where:{userId:payload.user.id}}),0);
            const {POST:login}=await import('./src/app/api/auth/login/route.ts');
            const signed=await login(request('/api/auth/login',{email,password}));assert.equal(signed.status,200);
            const challenge=await signed.json();assert.equal(challenge.mfaRequired,true);assert.equal(challenge.setupRequired,true);
            assert.equal(signed.headers.has('set-cookie'),false);
            const {authenticator}=await import('otplib');const {POST:verify}=await import('./src/app/api/auth/mfa/verify/route.ts');
            const verified=await verify(request('/api/auth/mfa/verify',{challengeToken:challenge.challengeToken,code:authenticator.generate(challenge.manualEntryKey)}));
            assert.equal(verified.status,200);assert.ok(verified.headers.get('set-cookie'));
            assert.equal(await db.authSession.count({where:{userId:payload.user.id,mfaVerifiedAt:{not:null}}}),1);
            const user=await db.user.findUniqueOrThrow({where:{id:payload.user.id}});assert.equal(user.mfaEnabled,true);assert.ok(user.mfaSecret.startsWith('v1:'));
          }else{
            assert.equal(payload.signInRequired,undefined);assert.ok(response.headers.get('set-cookie'));
            assert.equal(await db.authSession.count({where:{userId:payload.user.id,mfaVerifiedAt:null}}),1);
          }
        }finally{await db.user.deleteMany({where:{email}});await db.$disconnect()}
      })().catch(error=>{console.error(error.message);process.exitCode=1});`], { env, timeout: 15_000 })
  })
}
