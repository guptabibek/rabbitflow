'use client'

import { useCallback, useRef } from 'react'
import { useOnboardingSafe } from '@/hooks/use-onboarding'
import { useAppStore } from '@/store/app-store'

/**
 * Maps user actions to onboarding step view-tracking events.
 * Data-based completion (has_project, has_issue, etc.) is handled
 * automatically by the evaluation engine on the next status fetch.
 *
 * This hook handles event-based steps that need explicit recording
 * (e.g., "user viewed the board" or "user viewed reports").
 */

type OnboardingAction =
  | 'view_board'
  | 'view_reports'
  | 'view_backlog'
  | 'create_project'
  | 'create_issue'
  | 'invite_member'
  | 'create_sprint'
  | 'assign_issue'
  | 'create_team'
  | 'create_label'
  | 'complete_issue'

/** Map actions to step keys for event-based tracking */
const ACTION_TO_EVENT_STEP: Record<string, string> = {
  view_board: 'viewed_board',
  view_reports: 'viewed_reports',
}

export function useOnboardingEvents() {
  const ctx = useOnboardingSafe()
  const currentProject = useAppStore((state) => state.currentProject)
  const debounceRef = useRef<Record<string, number>>({})

  /**
   * Track an onboarding action. For data-based steps, triggers a
   * status refresh. For event-based steps, records the event first.
   */
  const trackAction = useCallback(
    (action: OnboardingAction) => {
      const projectId = currentProject?.id
      if (!projectId) return

      // Debounce: skip if same action tracked within 5 seconds
      const now = Date.now()
      if (debounceRef.current[action] && now - debounceRef.current[action] < 5000) {
        return
      }
      debounceRef.current[action] = now

      const eventStep = ACTION_TO_EVENT_STEP[action]

      if (!eventStep) {
        // Data-based step: the engine re-evaluates real data on the next fetch.
        void ctx?.refresh()
        return
      }

      /*
        Post the event directly rather than through the context.

        The workspace calls this hook from the same component that renders
        `OnboardingProvider`, so it sits *above* its own provider and
        `useOnboardingSafe()` returns null — every call used to bail out at the
        top. The two event-based steps, "View your Kanban board" and "Check out
        reports", were therefore never recorded for anyone, and the checklist
        could not pass 80%.

        Writing the event here does not depend on where the provider sits. The
        refresh below is still routed through the context when it is available,
        so a mounted checklist updates immediately; without it the next status
        fetch picks the event up anyway.
      */
      void (async () => {
        try {
          await fetch('/api/onboarding/event', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ projectId, stepKey: eventStep }),
          })
        } catch {
          // Onboarding progress is not worth interrupting navigation for.
          return
        }

        await ctx?.refresh()
      })()
    },
    [ctx, currentProject?.id]
  )

  return { trackAction }
}
