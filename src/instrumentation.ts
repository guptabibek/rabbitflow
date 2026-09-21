export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    // Validate configuration before anything else starts. In production this
    // throws, so a misconfigured deployment fails fast instead of serving
    // traffic with, for example, an empty JWT signing key.
    const { validateEnv } = await import('@/lib/env')
    validateEnv()

    const { startEmailWorker } = await import('@/lib/email-queue')
    const worker = startEmailWorker()

    // Processes webhook delivery, SLA timer attachment and assignment email —
    // effects that previously ran as un-awaited promises inside the request.
    const { startSideEffectWorker } = await import('@/lib/job-queue')
    const sideEffectWorker = startSideEffectWorker()

    // Graceful shutdown. Without this the process died on deploy with in-flight
    // requests and a running BullMQ worker, leaving jobs stalled until their
    // lock expired before another worker could pick them up.
    const shutdown = async (signal: string) => {
      console.info(`Received ${signal}, shutting down gracefully...`)

      try {
        await Promise.all([worker.close(), sideEffectWorker?.close()])
      } catch (error) {
        console.error('Error closing background workers:', error)
      }

      try {
        const { db } = await import('@/lib/db')
        await db.$disconnect()
      } catch (error) {
        console.error('Error disconnecting database:', error)
      }

      process.exit(0)
    }

    // `once` so a second signal during shutdown terminates immediately rather
    // than re-entering the handler.
    process.once('SIGTERM', () => void shutdown('SIGTERM'))
    process.once('SIGINT', () => void shutdown('SIGINT'))
  }
}
