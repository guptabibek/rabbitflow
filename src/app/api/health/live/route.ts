import { NextResponse } from 'next/server'

/**
 * Liveness probe.
 *
 * Answers only "is this process running and able to serve a request?". It must
 * never check dependencies: a liveness failure means the orchestrator should
 * *restart* the container, and restarting will not fix a downed database or
 * cache. Dependency health belongs in `/api/health/ready`.
 */
export async function GET() {
  return NextResponse.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
  })
}
