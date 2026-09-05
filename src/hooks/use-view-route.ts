'use client'

import { useCallback, useEffect, useState } from 'react'

/**
 * Keeps the active workspace view in the URL.
 *
 * Every view — board, backlog, list, reports, roadmap and the rest — lived in a
 * single `useState`, so the address bar read `/` no matter what was on screen.
 * Nothing could be linked, bookmarked, or reopened in a new tab, browser Back
 * exited the application instead of returning to the previous view, and a
 * refresh always landed on Dashboard.
 *
 * This synchronises that state with a `?view=` parameter, which restores deep
 * links and history without restructuring the component tree.
 *
 * `history.pushState` is used directly rather than the Next router: the view
 * lives entirely in client state, so a router navigation would re-run the
 * server render for no benefit and lose the loaded project data.
 */

const VIEW_PARAM = 'view'

export function useViewRoute<T extends string>(options: {
  defaultView: T
  /** Guard against a hand-edited URL naming a view that does not exist. */
  isValidView: (value: string) => value is T
  /** Called when history navigation changes the view, so callers can react. */
  onExternalChange?: (view: T) => void
}) {
  const { defaultView, isValidView, onExternalChange } = options

  const readViewFromUrl = useCallback((): T => {
    if (typeof window === 'undefined') return defaultView
    const value = new URLSearchParams(window.location.search).get(VIEW_PARAM)
    return value && isValidView(value) ? value : defaultView
  }, [defaultView, isValidView])

  // Initialised from the URL rather than a constant, so a deep link opens the
  // view it names instead of flashing the dashboard first.
  const [view, setViewState] = useState<T>(readViewFromUrl)

  // Tidy a URL naming a view that does not exist, so the address bar cannot
  // keep claiming a view the app is not showing. replaceState, not pushState:
  // correcting bad input should not add a history entry the user must go back
  // through.
  useEffect(() => {
    const raw = new URLSearchParams(window.location.search).get(VIEW_PARAM)
    if (raw === null || isValidView(raw)) return

    const url = new URL(window.location.href)
    url.searchParams.delete(VIEW_PARAM)
    window.history.replaceState(null, '', url)
  }, [isValidView])

  // Track back/forward. The listener reads the URL rather than a captured
  // value, so it stays correct across many entries.
  useEffect(() => {
    const handlePopState = () => {
      const next = readViewFromUrl()
      setViewState(next)
      onExternalChange?.(next)
    }

    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [onExternalChange, readViewFromUrl])

  const setView = useCallback(
    (next: T, options?: { replace?: boolean }) => {
      setViewState(next)

      if (typeof window === 'undefined') return

      const url = new URL(window.location.href)

      // The default view is represented by the absence of the parameter, so the
      // canonical workspace URL stays clean.
      if (next === defaultView) url.searchParams.delete(VIEW_PARAM)
      else url.searchParams.set(VIEW_PARAM, next)

      if (url.href === window.location.href) return

      // replace() for programmatic corrections that should not add an entry;
      // push() for user navigation, so Back returns to the previous view.
      if (options?.replace) window.history.replaceState(null, '', url)
      else window.history.pushState(null, '', url)
    },
    [defaultView]
  )

  return { view, setView }
}
