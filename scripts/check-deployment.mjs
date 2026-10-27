// Read-only observation of the owner-provided deployment. Never sends credentials or mutates data.
const origin = 'https://devops.rabbittech.com.np'
const results = []
for (const path of ['/', '/login', '/api/health/live', '/api/health/ready', '/api/projects', '/api/users', '/brand/rabbitflow-mark.png']) {
  try {
    const response = await fetch(origin + path, { redirect: 'manual', signal: AbortSignal.timeout(20_000) })
    const result = { path, status: response.status, tls: 'verified', hsts: response.headers.has('strict-transport-security'), noSniff: response.headers.get('x-content-type-options')?.split(',').some(value => value.trim().toLowerCase() === 'nosniff') ?? false }
    const location = response.headers.get('location')
    if (location) result.redirectPath = new URL(location, origin).pathname
    if (path.endsWith('/ready') && response.ok) {
      const body = await response.json()
      result.ready = body.status === 'ready' && body.checks?.database === 'ok' && ['ok', 'not-configured'].includes(body.checks?.redis)
    }
    if (path.startsWith('/brand/') && response.ok) result.assetReadable = response.headers.get('content-type')?.startsWith('image/') && (await response.arrayBuffer()).byteLength > 0
    result.pass = ['/api/projects', '/api/users'].includes(path) ? response.status === 401
      : path.startsWith('/brand/') ? response.ok && result.assetReadable === true
      : path === '/' ? [200, 301, 302, 303, 307, 308].includes(response.status)
      : response.ok && (!path.endsWith('/ready') || result.ready === true)
    results.push(result)
  } catch (error) {
    results.push({ path, pass: false, error: error.cause?.code || error.name })
  }
}
console.log(JSON.stringify({ origin, checkedAt: new Date().toISOString(), results }, null, 2))
if (process.env.GITHUB_ACTIONS === 'true') {
  // Keep safe evidence available as check annotations even when log archives are restricted.
  for (const result of results) {
    const message = JSON.stringify(result).replaceAll('%', '%25').replaceAll('\r', '%0D').replaceAll('\n', '%0A')
    console.log(`::${result.pass ? 'notice' : 'error'} title=Read-only deployment observation::${message}`)
  }
}
if (results.some(result => !result.pass)) process.exitCode = 1
