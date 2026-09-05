import { NextResponse } from 'next/server'
import { randomUUID } from 'node:crypto'
import { z } from 'zod'

/**
 * A single shape for API error responses.
 *
 * Errors previously took at least four different forms — a bare
 * `{ error: string }`, one with raw zod issues attached, one with a permissions
 * object, and one that echoed `error.message` straight from a 5xx. Clients
 * could not tell a validation failure from a conflict from a quota without
 * matching on message text, and the fourth form leaked internal detail
 * (nodemailer and Prisma messages) to whoever asked.
 *
 * `error` stays a human-readable string so existing callers keep working; the
 * additions are `code` for machine dispatch and `requestId` for correlating a
 * user's report with a server log line.
 */

export const API_ERROR_CODES = {
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  UNAUTHENTICATED: 'UNAUTHENTICATED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  RATE_LIMITED: 'RATE_LIMITED',
  INTERNAL: 'INTERNAL',
} as const

export type ApiErrorCode = (typeof API_ERROR_CODES)[keyof typeof API_ERROR_CODES]

const STATUS_FOR_CODE: Record<ApiErrorCode, number> = {
  VALIDATION_FAILED: 400,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  RATE_LIMITED: 429,
  INTERNAL: 500,
}

/** Header carrying the correlation id, so a client can quote it in a report. */
export const REQUEST_ID_HEADER = 'x-request-id'

export function readRequestId(request: { headers: Headers }): string {
  return request.headers.get(REQUEST_ID_HEADER) ?? randomUUID()
}

export type ApiErrorOptions = {
  code: ApiErrorCode
  message: string
  details?: unknown
  status?: number
  requestId?: string
}

export function apiError(options: ApiErrorOptions): NextResponse {
  const status = options.status ?? STATUS_FOR_CODE[options.code]
  const requestId = options.requestId ?? randomUUID()

  return NextResponse.json(
    {
      // Kept for compatibility with existing clients, which read `error`
      // directly as a string.
      error: options.message,
      code: options.code,
      requestId,
      ...(options.details === undefined ? {} : { details: options.details }),
    },
    { status, headers: { [REQUEST_ID_HEADER]: requestId } }
  )
}

/**
 * Translate a zod failure into a validation response.
 *
 * Reports every issue rather than only the first, so a client fixing a form
 * does not have to submit repeatedly to discover each problem in turn.
 */
export function validationError(error: z.ZodError, requestId?: string): NextResponse {
  return apiError({
    code: API_ERROR_CODES.VALIDATION_FAILED,
    message: error.issues[0]?.message ?? 'Validation failed',
    details: {
      issues: error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      })),
    },
    requestId,
  })
}

/**
 * Terminal handler for an unexpected exception.
 *
 * The full error goes to the log with the correlation id; the client gets a
 * generic message and that id. Internal messages — SMTP failures, Prisma query
 * text, stack traces — must never reach a response body.
 */
export function internalError(
  context: string,
  error: unknown,
  requestId: string = randomUUID()
): NextResponse {
  console.error(
    JSON.stringify({
      level: 'error',
      requestId,
      context,
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    })
  )

  return apiError({
    code: API_ERROR_CODES.INTERNAL,
    message: 'Something went wrong. If this persists, quote the request id below.',
    requestId,
  })
}
