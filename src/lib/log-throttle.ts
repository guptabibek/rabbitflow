/**
 * Collapses a repeating error into one line plus a periodic summary.
 *
 * BullMQ workers re-emit their connection error on every reconnect attempt.
 * With Redis unreachable that is roughly one `AggregateError` every seven
 * seconds, and `console.error(label, error)` prints the whole object — both
 * nested `ECONNREFUSED` errors, each with a stack. Measured on a dev server:
 * four multi-line stacks every thirty seconds, sustained, from a single
 * dependency being down. Over a day that is ~11k stacks and several megabytes
 * per worker, and it buries every other line in the log.
 *
 * The signal in that stream is "Redis is down", which is worth exactly one
 * line, plus an occasional reminder that it is still down. Anything more is
 * noise that costs disk and hides real failures.
 *
 * A *different* error still prints immediately — this suppresses repetition,
 * not information.
 */

type Throttle = (error: unknown) => void

/** One line, no stack. Enough to identify the fault, short enough to scan. */
function describe(error: unknown): string {
  if (error instanceof AggregateError && error.errors.length > 0) {
    // ioredis wraps per-address failures; they are all the same fault.
    // `address` and `port` are set by Node's net layer but are not on the
    // ErrnoException type, so they are read through a narrow local shape.
    const first = error.errors[0] as NodeJS.ErrnoException & {
      address?: string
      port?: number
    }
    const code = first?.code ?? 'AggregateError'
    const target = first?.address && first?.port ? ` ${first.address}:${first.port}` : ''
    return `${code}${target} (${error.errors.length} addresses)`
  }

  if (error instanceof Error) {
    const code = (error as NodeJS.ErrnoException).code
    return code ? `${code}: ${error.message}` : error.message
  }

  return String(error)
}

/**
 * What counts as "the same error". Deliberately coarse: the code and
 * constructor, not the message, so a port number rotating in the text does not
 * defeat the throttle.
 */
function signatureOf(error: unknown): string {
  if (error instanceof AggregateError && error.errors.length > 0) {
    const first = error.errors[0] as NodeJS.ErrnoException
    return `aggregate:${first?.code ?? 'unknown'}`
  }

  if (error instanceof Error) {
    return `${error.name}:${(error as NodeJS.ErrnoException).code ?? error.message.slice(0, 80)}`
  }

  return String(error).slice(0, 80)
}

export function createThrottledErrorLogger(label: string, windowMs = 60_000): Throttle {
  let signature: string | null = null
  let suppressed = 0
  let windowStart = 0
  let lastMessage = ''

  const flush = (now: number) => {
    if (suppressed === 0) return

    const seconds = Math.max(1, Math.round((now - windowStart) / 1000))
    console.error(
      `${label}: still failing — ${suppressed} further ${
        suppressed === 1 ? 'occurrence' : 'occurrences'
      } in the last ${seconds}s (${lastMessage})`
    )

    suppressed = 0
    windowStart = now
  }

  return (error: unknown) => {
    const now = Date.now()
    const nextSignature = signatureOf(error)
    const message = describe(error)

    // A new kind of failure is news. Report what the old one was doing first,
    // so the summary is not lost.
    if (nextSignature !== signature) {
      flush(now)
      signature = nextSignature
      lastMessage = message
      windowStart = now
      suppressed = 0
      console.error(`${label}: ${message}`)
      return
    }

    suppressed += 1
    lastMessage = message

    if (now - windowStart >= windowMs) flush(now)
  }
}
