import type { CSSProperties, ReactNode } from 'react'
import Link from 'next/link'
import { CircleHelp, LifeBuoy, Mail } from 'lucide-react'
import { type ResolvedProjectBranding } from '@/lib/domain/project-branding'

type AuthShellProps = {
  branding: ResolvedProjectBranding
  title: string
  description: string
  children: ReactNode
  footer?: ReactNode
}

function brandMonogram(displayName: string) {
  return displayName
    .split(/\s+/)
    .map((segment) => segment[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()
}

/**
 * The signed-out shell.
 *
 * Sign-in is a doorway, not a landing page. What it replaces was a marketing
 * hero — a 48px headline, an accent gradient, two frosted cards of product
 * copy, and the brand lockup stated three times — wrapped around a form four
 * fields tall. It also introduced a second accent that appeared nowhere in the
 * product behind it, so the first two screens of the application did not look
 * like the same software.
 *
 * Now: one quiet context column that answers "whose system is this", one form
 * column that answers "how do I get in", and nothing else competing.
 */
export function AuthShell({ branding, title, description, children, footer }: AuthShellProps) {
  const supportLinks = [
    branding.helpCenterUrl
      ? { href: branding.helpCenterUrl, label: 'Help centre', icon: CircleHelp }
      : null,
    branding.supportUrl
      ? { href: branding.supportUrl, label: 'Support portal', icon: LifeBuoy }
      : null,
    branding.supportEmail
      ? { href: `mailto:${branding.supportEmail}`, label: branding.supportEmail, icon: Mail }
      : null,
  ].filter((value): value is NonNullable<typeof value> => Boolean(value))

  // The one place a tenant's own colour is applied. Everything else on the page
  // stays in the product's palette, so a badly chosen accent can never make the
  // sign-in form unreadable.
  const markStyle: CSSProperties = { backgroundColor: branding.accentColor }

  const brandMark = (
    <span
      aria-hidden="true"
      className="flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-md text-[11px] font-bold tracking-wide text-white"
      style={branding.logoUrl ? undefined : markStyle}
    >
      {branding.logoUrl ? (
        <img src={branding.logoUrl} alt="" className="size-full object-cover" />
      ) : (
        brandMonogram(branding.displayName)
      )}
    </span>
  )

  return (
    <main
      id="main-content"
      className="min-h-dvh bg-background lg:grid lg:grid-cols-[minmax(0,1fr)_30rem] xl:grid-cols-[minmax(0,1fr)_34rem]"
    >
      {/*
        Context, not salesmanship. Hidden below lg because on a phone the only
        thing that matters is the form, and a collapsed hero above it just
        pushes the password field under the fold.

        `bg-sidebar` rather than `bg-surface-sunken`: the sunken tone is barely
        a shade off the canvas in dark mode, so the split read as one flat
        rectangle with a stray line down it. The sidebar tone is the same
        chrome surface the signed-in application uses. Content is centred as
        one block rather than pinned to the top and bottom edges, which left
        600px of nothing between the brand and the headline on a laptop.
      */}
      <section className="relative hidden flex-col justify-center gap-10 border-r border-border bg-sidebar p-10 lg:flex xl:p-14">
        <div className="flex items-center gap-2.5">
          {brandMark}
          <div className="min-w-0">
            <p className="truncate text-[13px] font-semibold tracking-[-0.01em] text-foreground">
              {branding.displayName}
            </p>
            {branding.organizationName ? (
              <p className="truncate text-xs text-muted-foreground">
                {branding.organizationName}
              </p>
            ) : null}
          </div>
        </div>

        <div className="max-w-md">
          <h2 className="text-[1.75rem] font-semibold leading-tight tracking-[-0.025em] text-foreground xl:text-[2rem]">
            {branding.loginHeadline || 'Plan it, build it, ship it.'}
          </h2>
          <p className="mt-3 text-[13px] leading-relaxed text-muted-foreground">
            {branding.loginSubcopy ||
              'Boards, backlogs, sprints and reporting for teams that have to answer for what they deliver.'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
          {supportLinks.length > 0 ? (
            supportLinks.map((link) => {
              const Icon = link.icon
              const external = !link.href.startsWith('mailto:')

              return (
                <Link
                  key={link.href}
                  href={link.href}
                  target={external ? '_blank' : undefined}
                  rel={external ? 'noreferrer' : undefined}
                  className="inline-flex items-center gap-1.5 rounded-sm text-xs text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                >
                  <Icon className="size-3.5" aria-hidden="true" />
                  <span className="truncate">{link.label}</span>
                </Link>
              )
            })
          ) : (
            <p className="text-xs text-muted-foreground">
              {branding.customDomain || ''}
            </p>
          )}
        </div>
      </section>

      <section className="flex min-h-dvh items-center justify-center px-5 py-10 sm:px-8 lg:min-h-0">
        <div className="w-full max-w-sm">
          {/* On narrow screens this is the only brand statement on the page. */}
          <div className="mb-7 flex items-center gap-2.5 lg:hidden">
            {brandMark}
            <p className="truncate text-[13px] font-semibold tracking-[-0.01em] text-foreground">
              {branding.displayName}
            </p>
          </div>

          <h1 className="type-display text-foreground">{title}</h1>
          <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">{description}</p>

          <div className="mt-6">{children}</div>

          {footer ? (
            <div className="mt-6 border-t border-border pt-4 text-[13px]">{footer}</div>
          ) : null}
        </div>
      </section>
    </main>
  )
}
