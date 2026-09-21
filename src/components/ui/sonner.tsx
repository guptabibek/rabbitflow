"use client"

import { useTheme } from "next-themes"
import { AlertTriangle, CheckCircle2, Info, Loader2, XCircle } from "lucide-react"
import { Toaster as Sonner, ToasterProps } from "sonner"

/**
 * Toasts confirm that something happened and say so once.
 *
 * The tone is carried by a coloured icon and a hairline, not by a fully
 * saturated background: a solid red panel sliding over the corner of a board
 * is an interruption, and the same failure repeated three times becomes
 * wallpaper. Errors are given longer on screen than successes, because a
 * success is a confirmation of something the user already knows they did.
 */
const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme()

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      offset={16}
      gap={8}
      visibleToasts={3}
      icons={{
        success: <CheckCircle2 className="size-4 text-success" />,
        error: <XCircle className="size-4 text-danger" />,
        warning: <AlertTriangle className="size-4 text-warning" />,
        info: <Info className="size-4 text-info" />,
        loading: <Loader2 className="size-4 animate-spin text-muted-foreground" />,
      }}
      toastOptions={{
        duration: 4000,
        classNames: {
          toast:
            "group toast rounded-lg border border-border bg-popover text-popover-foreground shadow-lg",
          title: "text-[13px] font-medium",
          description: "text-xs text-muted-foreground",
          actionButton:
            "h-7 rounded-md bg-primary px-2.5 text-[12px] font-medium text-primary-foreground",
          cancelButton:
            "h-7 rounded-md bg-secondary px-2.5 text-[12px] font-medium text-secondary-foreground",
          closeButton: "border-border bg-popover text-muted-foreground",
          error: "border-danger-border",
          success: "border-success-border",
          warning: "border-warning-border",
          info: "border-info-border",
        },
      }}
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
          "--border-radius": "var(--radius-lg)",
        } as React.CSSProperties
      }
      {...props}
    />
  )
}

export { Toaster }
