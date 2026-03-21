export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { startEmailWorker } = await import('@/lib/email-queue')
    startEmailWorker()
  }
}
