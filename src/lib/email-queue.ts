import { Queue, Worker, type ConnectionOptions } from 'bullmq'
import { sendEmail } from '@/lib/email'

type EmailJobData = {
  to: string
  subject: string
  text: string
  html?: string
}

const QUEUE_NAME = 'email'

function getConnection(): ConnectionOptions {
  const url = process.env.REDIS_URL || process.env.REDIS_TLS_URL
  if (url) return { url }

  return {
    host: process.env.REDIS_HOST || 'localhost',
    port: process.env.REDIS_PORT ? Number.parseInt(process.env.REDIS_PORT, 10) : 6379,
    password: process.env.REDIS_PASSWORD || undefined,
    username: process.env.REDIS_USERNAME || undefined,
  }
}

let queue: Queue<EmailJobData> | null = null

function getQueue(): Queue<EmailJobData> {
  if (!queue) {
    queue = new Queue<EmailJobData>(QUEUE_NAME, {
      connection: getConnection(),
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
        removeOnComplete: { count: 500 },
        removeOnFail: { count: 200 },
      },
    })
  }
  return queue
}

export async function enqueueEmail(payload: EmailJobData): Promise<void> {
  try {
    await getQueue().add('send', payload)
  } catch (error) {
    console.error('Failed to enqueue email, falling back to direct send:', error)
    sendEmail(payload).catch((sendError) =>
      console.error('Direct email send also failed:', sendError)
    )
  }
}

let workerInstance: Worker<EmailJobData> | null = null

export function startEmailWorker(): Worker<EmailJobData> {
  if (workerInstance) return workerInstance

  workerInstance = new Worker<EmailJobData>(
    QUEUE_NAME,
    async (job) => {
      await sendEmail(job.data)
    },
    {
      connection: getConnection(),
      concurrency: 5,
      limiter: { max: 10, duration: 1000 },
    }
  )

  workerInstance.on('failed', (job, error) => {
    console.error(`Email job ${job?.id} failed (attempt ${job?.attemptsMade}):`, error.message)
  })

  workerInstance.on('error', (error) => {
    console.error('Email worker error:', error)
  })

  return workerInstance
}
