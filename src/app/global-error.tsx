'use client'

import { useEffect } from 'react'

/**
 * Last-resort boundary for errors thrown during root layout render.
 *
 * Must declare its own <html>/<body> because it replaces the root layout
 * entirely when it activates.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('Unhandled application error:', error)
  }, [error])

  return (
    <html lang="en">
      <body style={{ margin: 0 }}>
        <div
          style={{
            minHeight: '100dvh',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '2rem',
            fontFamily:
              'Inter, "Segoe UI Variable Text", -apple-system, BlinkMacSystemFont, sans-serif',
            background: '#0b0d12',
            color: '#e6e8ee',
          }}
        >
          <div style={{ maxWidth: '32rem' }}>
            <h1 style={{ fontSize: '1.25rem', fontWeight: 600, margin: '0 0 0.5rem' }}>
              Something went wrong
            </h1>
            <p style={{ fontSize: '0.875rem', lineHeight: 1.6, color: '#9aa2b1', margin: '0 0 1.5rem' }}>
              RabbitFlow hit an unexpected error and could not finish loading. Your work has not
              been lost — reloading usually resolves it.
            </p>
            {error.digest && (
              <p style={{ fontSize: '0.75rem', color: '#6b7280', margin: '0 0 1.5rem' }}>
                Reference: <code>{error.digest}</code>
              </p>
            )}
            <button
              onClick={reset}
              style={{
                fontSize: '0.875rem',
                fontWeight: 500,
                padding: '0.5rem 1rem',
                borderRadius: '0.5rem',
                border: '1px solid #2a2f3a',
                background: '#1a1d25',
                color: '#e6e8ee',
                cursor: 'pointer',
              }}
            >
              Try again
            </button>
          </div>
        </div>
      </body>
    </html>
  )
}
