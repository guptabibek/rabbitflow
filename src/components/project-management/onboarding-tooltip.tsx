'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { X, Lightbulb } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useOnboardingSafe } from '@/hooks/use-onboarding'

// ── Types ──────────────────────────────────────────────────────

type TooltipPlacement = 'top' | 'bottom' | 'left' | 'right'

type OnboardingTooltipProps = {
  /** Which onboarding step this tooltip is associated with */
  stepKey: string
  /** Tooltip title */
  title: string
  /** Tooltip description */
  description: string
  /** Where to show the tooltip relative to children */
  placement?: TooltipPlacement
  /** Only show on this route (substring match) */
  route?: string
  /** Children element to wrap */
  children: ReactNode
  /** Extra class for the wrapper */
  className?: string
}

// ── Component ──────────────────────────────────────────────────

export function OnboardingTooltip({
  stepKey,
  title,
  description,
  placement = 'bottom',
  route,
  children,
  className,
}: OnboardingTooltipProps) {
  const ctx = useOnboardingSafe()
  const [isDismissed, setIsDismissed] = useState(false)
  const wrapperRef = useRef<HTMLDivElement>(null)

  // Don't show if:
  // - Provider not mounted
  // - Step already completed
  // - Step is dismissed in state
  // - User dismissed locally
  // - Onboarding fully dismissed
  const step = ctx?.status?.steps.find((s) => s.key === stepKey)
  const shouldShow =
    ctx &&
    !ctx.isLoading &&
    ctx.status &&
    !ctx.status.isDismissed &&
    step &&
    !step.isCompleted &&
    !step.isDismissed &&
    !isDismissed &&
    step.key === ctx.status.currentStep // Only show for the current active step

  // Route check
  const [currentPath, setCurrentPath] = useState('')
  useEffect(() => {
    setCurrentPath(window.location.pathname)
  }, [])

  const routeMatch = !route || currentPath.includes(route)
  const visible = shouldShow && routeMatch

  if (!visible) {
    return <>{children}</>
  }

  const handleDismiss = () => {
    setIsDismissed(true)
    ctx?.dismissStep(stepKey)
  }

  const placementStyles: Record<TooltipPlacement, string> = {
    top: 'bottom-full left-1/2 -translate-x-1/2 mb-2',
    bottom: 'top-full left-1/2 -translate-x-1/2 mt-2',
    left: 'right-full top-1/2 -translate-y-1/2 mr-2',
    right: 'left-full top-1/2 -translate-y-1/2 ml-2',
  }

  const arrowStyles: Record<TooltipPlacement, string> = {
    top: 'top-full left-1/2 -translate-x-1/2 border-t-primary/90 border-x-transparent border-b-transparent',
    bottom: 'bottom-full left-1/2 -translate-x-1/2 border-b-primary/90 border-x-transparent border-t-transparent',
    left: 'left-full top-1/2 -translate-y-1/2 border-l-primary/90 border-y-transparent border-r-transparent',
    right: 'right-full top-1/2 -translate-y-1/2 border-r-primary/90 border-y-transparent border-l-transparent',
  }

  return (
    <div ref={wrapperRef} className={cn('relative', className)}>
      {children}

      {/* Tooltip */}
      <div
        className={cn(
          'absolute z-50 w-64 animate-in fade-in-0 slide-in-from-bottom-1 duration-200',
          placementStyles[placement]
        )}
      >
        <div className="rounded-xl border border-primary/20 bg-card shadow-xl shadow-primary/5">
          <div className="flex items-start gap-2 p-3">
            <Lightbulb className="mt-0.5 h-4 w-4 flex-shrink-0 text-primary" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold leading-tight">{title}</p>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                {description}
              </p>
            </div>
            <button
              onClick={handleDismiss}
              className="flex-shrink-0 rounded-md p-0.5 text-muted-foreground/60 transition-colors hover:text-muted-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {/* Arrow */}
        <div
          className={cn(
            'absolute h-0 w-0 border-[6px]',
            arrowStyles[placement]
          )}
        />
      </div>
    </div>
  )
}

// ── Spotlight highlight wrapper ────────────────────────────────

type OnboardingSpotlightProps = {
  stepKey: string
  children: ReactNode
  className?: string
}

/**
 * Wraps a UI element with a subtle glow/pulse highlight when
 * the associated onboarding step is the current active step.
 */
export function OnboardingSpotlight({
  stepKey,
  children,
  className,
}: OnboardingSpotlightProps) {
  const ctx = useOnboardingSafe()

  const isActive =
    ctx?.status &&
    !ctx.status.isDismissed &&
    ctx.status.currentStep === stepKey &&
    !ctx.status.steps.find((s) => s.key === stepKey)?.isCompleted

  return (
    <div
      className={cn(
        'transition-all duration-300',
        isActive && 'ring-2 ring-primary/30 ring-offset-2 ring-offset-background rounded-lg',
        className
      )}
    >
      {children}
    </div>
  )
}
