'use client'

import { useCallback, useRef } from 'react'
import { useOnboardingSafe } from '@/hooks/use-onboarding'

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
  const debounceRef = useRef<Record<string, number>>({})

  /**
   * Track an onboarding action. For data-based steps, triggers a
   * status refresh. For event-based steps, records the event first.
   */
  const trackAction = useCallback(
    (action: OnboardingAction) => {
      if (!ctx) return

      // Debounce: skip if same action tracked within 5 seconds
      const now = Date.now()
      if (debounceRef.current[action] && now - debounceRef.current[action] < 5000) {
        return
      }
      debounceRef.current[action] = now

      const eventStep = ACTION_TO_EVENT_STEP[action]
      if (eventStep) {
        // Event-based step: record, then refresh
        void ctx.recordEvent(eventStep).then(() => ctx.refresh())
      } else {
        // Data-based step: just refresh (engine evaluates real data)
        void ctx.refresh()
      }
    },
    [ctx]
  )

  return { trackAction }
}
