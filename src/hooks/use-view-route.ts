'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

/**
 * Keeps the active workspace view in the URL.
 *
 * Every view — board, backlog, list, reports, roadmap and the rest — lived in a
 * single `useState`, so the address bar read `/` no matter what was on screen.
 * Nothing could be linked, bookmarked, or reopened in a new tab, browser Back
 * exited the application instead of returning to the previous view, and a
 * refresh always landed on Dashboard.
 *
 * Canonical project routes use App Router segments. The query-parameter branch
 * remains temporarily for old `/` links and is replaced after the workspace
 * resolves its active project.
 */

const VIEW_PARAM = 'view'

export function useViewRoute<T extends string>(options: {
  defaultView: T
  /** Guard against a hand-edited URL naming a view that does not exist. */
  isValidView: (value: string) => value is T
  /** Called when history navigation changes the view, so callers can react. */
  onExternalChange?: (view: T) => void
  /** View supplied by an App Router segment. */
  initialView?: T
  /** Project supplied by an App Router segment. */
  routeProjectId?: string
  /** Converts a project and view into the canonical App Router path. */
  buildCanonicalPath?: (projectId: string, view: T, search: string) => string
}) {
  const {
    defaultView,
    isValidView,
    onExternalChange,
    initialView,
    routeProjectId,
    buildCanonicalPath,
  } = options
  const router = useRouter()
  const onExternalChangeRef = useRef(onExternalChange)

  useEffect(() => {
    onExternalChangeRef.current = onExternalChange
  }, [onExternalChange])

  const readViewFromUrl = useCallback((): T => {
    if (initialView && isValidView(initialView)) return initialView
    if (typeof window === 'undefined') return defaultView
    const value = new URLSearchParams(window.location.search).get(VIEW_PARAM)
    return value && isValidView(value) ? value : defaultView
  }, [defaultView, initialView, isValidView])

  // Initialised from the URL rather than a constant, so a deep link opens the
  // view it names instead of flashing the dashboard first.
  const [view, setViewState] = useState<T>(readViewFromUrl)

  // App Router updates segment props for Back, Forward, and link navigation.
  // Notify the shell so route changes can dismiss stale overlays. The visible
  // value is derived from the prop below, so this effect does not mirror props
  // into state.
  useEffect(() => {
    if (!initialView) return
    onExternalChangeRef.current?.(initialView)
  }, [initialView])

  // Tidy a URL naming a view that does not exist, so the address bar cannot
  // keep claiming a view the app is not showing. replaceState, not pushState:
  // correcting bad input should not add a history entry the user must go back
  // through.
  useEffect(() => {
    if (initialView) return
    const raw = new URLSearchParams(window.location.search).get(VIEW_PARAM)
    if (raw === null || isValidView(raw)) return

    const url = new URL(window.location.href)
    url.searchParams.delete(VIEW_PARAM)
    window.history.replaceState(null, '', url)
  }, [initialView, isValidView])

  // Track back/forward. The listener reads the URL rather than a captured
  // value, so it stays correct across many entries.
  useEffect(() => {
    if (routeProjectId) return

    const handlePopState = () => {
      const next = readViewFromUrl()
      setViewState(next)
      onExternalChangeRef.current?.(next)
    }

    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [readViewFromUrl, routeProjectId])

  const setView = useCallback(
    (next: T, navigation?: { replace?: boolean; projectId?: string }) => {
      if (typeof window === 'undefined') return

      const destinationProjectId = navigation?.projectId ?? routeProjectId
      if (destinationProjectId && buildCanonicalPath) {
        const path = buildCanonicalPath(destinationProjectId, next, window.location.search)
        if (`${window.location.pathname}${window.location.search}` === path) return
        if (navigation?.replace) router.replace(path)
        else router.push(path)
        return
      }

      setViewState(next)

      const url = new URL(window.location.href)

      // The default view is represented by the absence of the parameter, so the
      // canonical workspace URL stays clean.
      if (next === defaultView) url.searchParams.delete(VIEW_PARAM)
      else url.searchParams.set(VIEW_PARAM, next)

      if (url.href === window.location.href) return

      // replace() for programmatic corrections that should not add an entry;
      // push() for user navigation, so Back returns to the previous view.
      if (navigation?.replace) window.history.replaceState(null, '', url)
      else window.history.pushState(null, '', url)
    },
    [buildCanonicalPath, defaultView, routeProjectId, router]
  )

  return { view: initialView ?? view, setView }
}
