import { performance } from 'node:perf_hooks'

const baseUrl = process.env.LOAD_TEST_BASE_URL?.replace(/\/$/, '')
const cookie = process.env.LOAD_TEST_COOKIE
const projectId = process.env.LOAD_TEST_PROJECT_ID
if (!baseUrl || !cookie || !projectId) throw new Error('LOAD_TEST_BASE_URL, LOAD_TEST_COOKIE, and LOAD_TEST_PROJECT_ID are required.')

const durationSeconds = Math.max(10, Number(process.env.LOAD_TEST_DURATION_SECONDS ?? 60))
const concurrency = Math.max(1, Number(process.env.LOAD_TEST_CONCURRENCY ?? 10))
const thinkTimeMs = Math.max(0, Number(process.env.LOAD_TEST_THINK_TIME_MS ?? 0))
if (![durationSeconds, concurrency, thinkTimeMs].every(Number.isFinite) || !Number.isInteger(concurrency)) {
  throw new Error('Load duration, concurrency and think time must be finite; concurrency must be an integer.')
}
const endpoints = [
  `/api/issues?projectId=${encodeURIComponent(projectId)}&pageSize=100`,
  `/api/roadmap?projectId=${encodeURIComponent(projectId)}`,
  `/api/portfolio`,
  `/api/dependency-graph?projectId=${encodeURIComponent(projectId)}`,
  `/api/reports/executive`,
]
const latencies = []
let requests = 0
let failures = 0
const statuses = {}
// Reject a bad session/target before measuring thousands of authentication failures.
for (const path of endpoints) {
  const response = await fetch(`${baseUrl}${path}`, { headers: { cookie }, redirect: 'manual', signal: AbortSignal.timeout(30_000) })
  await response.arrayBuffer()
  if (!response.ok) throw new Error(`Load-test preflight ${path.split('?')[0]} returned HTTP ${response.status}`)
}
const startedAt = performance.now()
const deadline = startedAt + durationSeconds * 1000

async function worker(workerId) {
  let cursor = workerId
  while (performance.now() < deadline) {
    const path = endpoints[cursor % endpoints.length]
    cursor += 1
    const started = performance.now()
    try {
      const response = await fetch(`${baseUrl}${path}`, { headers: { cookie }, redirect: 'manual', signal: AbortSignal.timeout(30_000) })
      await response.arrayBuffer()
      statuses[response.status] = (statuses[response.status] || 0) + 1
      if (!response.ok) failures += 1
    } catch {
      statuses.network_error = (statuses.network_error || 0) + 1
      failures += 1
    } finally {
      latencies.push(performance.now() - started)
      requests += 1
    }
    const remainingMs = deadline - performance.now()
    if (thinkTimeMs && remainingMs > 0) await new Promise(resolve => setTimeout(resolve, Math.min(thinkTimeMs, remainingMs)))
  }
}

await Promise.all(Array.from({ length: concurrency }, (_, index) => worker(index)))
latencies.sort((a, b) => a - b)
const percentile = (value) => latencies[Math.min(latencies.length - 1, Math.ceil(latencies.length * value) - 1)] ?? 0
const errorRate = requests ? failures / requests : 1
const elapsedSeconds = (performance.now() - startedAt) / 1000
const result = {
  durationSeconds,
  concurrency,
  thinkTimeMs,
  elapsedSeconds: Number(elapsedSeconds.toFixed(2)),
  statuses,
  requests,
  requestsPerSecond: Number((requests / elapsedSeconds).toFixed(2)),
  failures,
  errorRate: Number(errorRate.toFixed(4)),
  p75Ms: Number(percentile(0.75).toFixed(1)),
  p95Ms: Number(percentile(0.95).toFixed(1)),
  p99Ms: Number(percentile(0.99).toFixed(1)),
}
console.log(JSON.stringify(result, null, 2))
if (errorRate > Number(process.env.LOAD_TEST_MAX_ERROR_RATE ?? 0.01)) process.exitCode = 1
if (result.p75Ms > Number(process.env.LOAD_TEST_MAX_P75_MS ?? 1000)) process.exitCode = 1
