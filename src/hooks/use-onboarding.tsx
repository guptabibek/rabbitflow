'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { useAppStore } from '@/store/app-store'

// ── Types ──────────────────────────────────────────────────────

export type OnboardingStep = {
  key: string
  title: string
  description: string
  icon: string
  targetRoute: string | null
  ctaLabel: string
  ctaRoute: string | null
  completionRule: string
  order: number
  isCompleted: boolean
  isDismissed: boolean
}

export type OnboardingStatus = {
  steps: OnboardingStep[]
  completedCount: number
  totalCount: number
  progressPercent: number
  isDismissed: boolean
  currentStep: string | null
  completedAt: string | null
}

type OnboardingContextValue = {
  status: OnboardingStatus | null
  isLoading: boolean
  error: string | null
  /** Refresh status from server */
  refresh: () => Promise<void>
  /** Record a view/event-based step completion */
  recordEvent: (stepKey: string) => Promise<void>
  /** Dismiss a single step */
  dismissStep: (stepKey: string) => Promise<void>
  /** Dismiss the entire checklist */
  dismissAll: () => Promise<void>
  /** Check if a specific step is completed */
  isStepCompleted: (stepKey: string) => boolean
  /** Get the current (next uncompleted) step */
  currentStep: OnboardingStep | null
  /** Whether to show the checklist panel */
  showChecklist: boolean
}

const OnboardingContext = createContext<OnboardingContextValue | null>(null)

// ── Provider ───────────────────────────────────────────────────

const EMPTY_STATUS: OnboardingStatus = {
  steps: [],
  completedCount: 0,
  totalCount: 0,
  progressPercent: 0,
  isDismissed: false,
  currentStep: null,
  completedAt: null,
}

export function OnboardingProvider({ children }: { children: ReactNode }) {
  const currentProject = useAppStore((s) => s.currentProject)
  const [status, setStatus] = useState<OnboardingStatus | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const lastFetchRef = useRef<number>(0)
  const projectIdRef = useRef<string | null>(null)

  const fetchStatus = useCallback(async () => {
    if (!currentProject?.id) {
      setStatus(null)
      return
    }

    // Debounce: skip if fetched within last 2 seconds
    const now = Date.now()
    if (now - lastFetchRef.current < 2000 && projectIdRef.current === currentProject.id) {
      return
    }
    lastFetchRef.current = now
    projectIdRef.current = currentProject.id

    setIsLoading(true)
    try {
      const res = await fetch(`/api/onboarding/status?projectId=${currentProject.id}`)
      if (!res.ok) {
        throw new Error('Failed to fetch onboarding status')
      }
      const data: OnboardingStatus = await res.json()
      setStatus(data)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setIsLoading(false)
    }
  }, [currentProject?.id])

  // Fetch on project change
  useEffect(() => {
    void fetchStatus()
  }, [fetchStatus])

  const recordEvent = useCallback(
    async (stepKey: string) => {
      if (!currentProject?.id) return

      try {
        await fetch('/api/onboarding/event', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ projectId: currentProject.id, stepKey }),
        })
        // Optimistic update
        setStatus((prev) => {
          if (!prev) return prev
          const steps = prev.steps.map((s) =>
            s.key === stepKey ? { ...s, isCompleted: true } : s
          )
          const completedCount = steps.filter((s) => s.isCompleted).length
          return {
            ...prev,
            steps,
            completedCount,
            progressPercent: steps.length > 0 ? Math.round((completedCount / steps.length) * 100) : 0,
            currentStep: steps.find((s) => !s.isCompleted && !s.isDismissed)?.key ?? null,
          }
        })
      } catch {
        // Silent fail — non-critical
      }
    },
    [currentProject?.id]
  )

  const dismissStep = useCallback(
    async (stepKey: string) => {
      if (!currentProject?.id) return

      try {
        await fetch('/api/onboarding/dismiss', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ projectId: currentProject.id, stepKey }),
        })
        setStatus((prev) => {
          if (!prev) return prev
          const steps = prev.steps.map((s) =>
            s.key === stepKey ? { ...s, isDismissed: true } : s
          )
          return {
            ...prev,
            steps,
            currentStep: steps.find((s) => !s.isCompleted && !s.isDismissed)?.key ?? null,
          }
        })
      } catch {
        // Silent fail
      }
    },
    [currentProject?.id]
  )

  const dismissAll = useCallback(async () => {
    if (!currentProject?.id) return

    try {
      await fetch('/api/onboarding/dismiss', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId: currentProject.id, dismissAll: true }),
      })
      setStatus((prev) => (prev ? { ...prev, isDismissed: true } : prev))
    } catch {
      // Silent fail
    }
  }, [currentProject?.id])

  const isStepCompleted = useCallback(
    (stepKey: string) => {
      return status?.steps.find((s) => s.key === stepKey)?.isCompleted ?? false
    },
    [status]
  )

  const currentStep =
    status?.steps.find((s) => s.key === status.currentStep) ?? null

  const showChecklist =
    !!status &&
    !status.isDismissed &&
    status.progressPercent < 100 &&
    status.totalCount > 0

  return (
    <OnboardingContext.Provider
      value={{
        status,
        isLoading,
        error,
        refresh: fetchStatus,
        recordEvent,
        dismissStep,
        dismissAll,
        isStepCompleted,
        currentStep,
        showChecklist,
      }}
    >
      {children}
    </OnboardingContext.Provider>
  )
}

// ── Hook ───────────────────────────────────────────────────────

export function useOnboarding() {
  const ctx = useContext(OnboardingContext)
  if (!ctx) {
    throw new Error('useOnboarding must be used within OnboardingProvider')
  }
  return ctx
}

/**
 * Hook to safely use onboarding context when it may not be available.
 * Returns null if outside the provider (e.g. login/register pages).
 */
export function useOnboardingSafe() {
  return useContext(OnboardingContext)
}
