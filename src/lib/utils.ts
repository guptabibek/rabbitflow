import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

const DEFAULT_RETRYABLE_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504])

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export function isRetryableResponseStatus(status: number) {
  return DEFAULT_RETRYABLE_STATUSES.has(status)
}

export function isAbortError(error: unknown) {
  return error instanceof Error && error.name === 'AbortError'
}

export async function parseJsonResponse<T>(response: Response, fallback: T): Promise<T> {
  try {
    return (await response.clone().json()) as T
  } catch {
    return fallback
  }
}

type FetchWithRetryOptions = RequestInit & {
  timeoutMs?: number
  retries?: number
  retryDelayMs?: number
}

function combineAbortSignals(signals: AbortSignal[]) {
  if (typeof AbortSignal.any === 'function') {
    return AbortSignal.any(signals)
  }

  const controller = new AbortController()
  for (const signal of signals) {
    if (signal.aborted) {
      controller.abort(signal.reason)
      return controller.signal
    }

    signal.addEventListener(
      'abort',
      () => {
        if (!controller.signal.aborted) {
          controller.abort(signal.reason)
        }
      },
      { once: true }
    )
  }

  return controller.signal
}

export async function fetchWithRetry(
  input: RequestInfo | URL,
  options: FetchWithRetryOptions = {}
) {
  const {
    timeoutMs = 8_000,
    retries = 0,
    retryDelayMs = 400,
    signal,
    ...init
  } = options

  let lastError: unknown = null

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(new Error('Request timed out')), timeoutMs)

    try {
      const response = await fetch(input, {
        ...init,
        signal: signal ? combineAbortSignals([signal, controller.signal]) : controller.signal,
      })

      if (attempt < retries && isRetryableResponseStatus(response.status)) {
        await response.body?.cancel().catch(() => undefined)
        await sleep(retryDelayMs * (attempt + 1))
        continue
      }

      return response
    } catch (error) {
      lastError = error

      if (attempt >= retries || (!isAbortError(error) && !(error instanceof TypeError))) {
        throw error
      }

      await sleep(retryDelayMs * (attempt + 1))
    } finally {
      clearTimeout(timeout)
    }
  }

  throw lastError instanceof Error ? lastError : new Error('Request failed')
}

export async function getApiErrorMessage(response: Response, fallback: string) {
  try {
    const contentType = response.headers.get('content-type') ?? ''
    if (contentType.includes('application/json')) {
      const payload = await parseJsonResponse<{
        error?: unknown
        message?: unknown
      } | null>(response, null)

      if (!payload) {
        return fallback
      }

      if (typeof payload.error === 'string' && payload.error.trim()) {
        return payload.error
      }

      if (typeof payload.message === 'string' && payload.message.trim()) {
        return payload.message
      }
    } else {
      const text = await response.clone().text()
      if (text.trim()) {
        return text.trim()
      }
    }
  } catch {
    return fallback
  }

  return fallback
}
