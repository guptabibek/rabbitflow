export type EmailJobPayload = {
  to: string
  subject: string
  text: string
  html?: string
}

type EnqueueEmailDependencies = {
  addToQueue: (payload: EmailJobPayload) => Promise<unknown>
  sendDirect: (payload: EmailJobPayload) => Promise<unknown>
}

export async function enqueueEmailWithFallback(
  payload: EmailJobPayload,
  dependencies: EnqueueEmailDependencies
): Promise<void> {
  try {
    await dependencies.addToQueue(payload)
  } catch (error) {
    console.error('Failed to enqueue email, falling back to direct send:', error)
    try {
      await dependencies.sendDirect(payload)
    } catch (sendError) {
      console.error('Direct email send also failed:', sendError)
      throw sendError
    }
  }
}