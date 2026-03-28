import type { CSSProperties, ReactNode } from 'react'
import Link from 'next/link'
import { Building2, CircleHelp, FolderKanban, LifeBuoy, Mail } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { type ResolvedProjectBranding } from '@/lib/domain/project-branding'

type AuthShellProps = {
  branding: ResolvedProjectBranding
  title: string
  description: string
  children: ReactNode
  footer?: ReactNode
}

function withAlpha(color: string, alphaHex: string) {
  return `${color}${alphaHex}`
}

function brandMonogram(displayName: string) {
  return displayName
    .split(/\s+/)
    .map((segment) => segment[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()
}

export function AuthShell({ branding, title, description, children, footer }: AuthShellProps) {
  const supportLinks = [
    branding.helpCenterUrl
      ? {
          href: branding.helpCenterUrl,
          label: 'Help Center',
          icon: CircleHelp,
        }
      : null,
    branding.supportUrl
      ? {
          href: branding.supportUrl,
          label: 'Support Portal',
          icon: LifeBuoy,
        }
      : null,
    branding.supportEmail
      ? {
          href: `mailto:${branding.supportEmail}`,
          label: branding.supportEmail,
          icon: Mail,
        }
      : null,
  ].filter((value): value is NonNullable<typeof value> => Boolean(value))

  const heroStyle: CSSProperties = {
    backgroundImage: `radial-gradient(circle at top left, ${withAlpha(branding.accentColor, '3d')}, transparent 42%), linear-gradient(145deg, ${withAlpha(branding.accentColor, '18')}, rgba(15, 23, 42, 0.94))`,
    borderColor: withAlpha(branding.accentColor, '33'),
  }

  const cardStyle: CSSProperties = {
    borderColor: withAlpha(branding.accentColor, '2e'),
    boxShadow: `0 28px 70px ${withAlpha(branding.accentColor, '1c')}`,
  }

  return (
    <main
      id="main-content"
      className="min-h-dvh bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.08),_transparent_35%),linear-gradient(180deg,_rgba(15,23,42,0.08),_transparent_45%)] px-4 py-6 sm:px-6 sm:py-8 lg:px-8"
    >
      <div className="mx-auto grid min-h-[calc(100dvh-3rem)] max-w-6xl items-center gap-6 sm:min-h-[calc(100dvh-4rem)] md:grid-cols-[1.1fr_0.9fr]">
        <section
          className="relative hidden overflow-hidden rounded-2xl border bg-slate-950 text-slate-50 md:block md:rounded-3xl lg:rounded-[32px]"
          style={heroStyle}
        >
          <div className="absolute inset-x-0 top-0 h-1.5" style={{ backgroundColor: branding.accentColor }} />
          <div className="relative flex h-full flex-col justify-between gap-8 p-6 md:p-8 lg:gap-10 lg:p-12">
            <div className="space-y-6 lg:space-y-8">
              <div className="flex items-center gap-3 lg:gap-4">
                <div
                  className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-2xl border border-white/15 bg-white/10 shadow-lg lg:h-16 lg:w-16 lg:rounded-[22px]"
                  style={{ boxShadow: `0 20px 45px ${withAlpha(branding.accentColor, '33')}` }}
                >
                  {branding.logoUrl ? (
                    <img src={branding.logoUrl} alt={`${branding.displayName} logo`} className="h-full w-full object-cover" />
                  ) : (
                    <span className="text-lg font-semibold tracking-[0.24em] text-white">
                      {brandMonogram(branding.displayName)}
                    </span>
                  )}
                </div>
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge className="border-0 bg-white/10 text-[11px] uppercase tracking-[0.18em] text-slate-200">
                      {branding.organizationName || 'Enterprise Workspace'}
                    </Badge>
                    {branding.customDomain ? (
                      <Badge variant="outline" className="border-white/15 bg-transparent text-slate-200">
                        {branding.customDomain}
                      </Badge>
                    ) : null}
                  </div>
                  <div>
                    <p className="text-2xl font-semibold tracking-tight">{branding.displayName}</p>
                    <p className="text-sm text-slate-300">Project delivery, governance, and collaboration in one surface.</p>
                  </div>
                </div>
              </div>

              <div className="max-w-xl space-y-3 lg:space-y-4">
                <h1 className="text-3xl font-semibold tracking-tight text-white lg:text-4xl xl:text-5xl">
                  {branding.loginHeadline || `Welcome to ${branding.displayName}`}
                </h1>
                <p className="text-sm leading-6 text-slate-300 lg:text-base lg:leading-7">
                  {branding.loginSubcopy ||
                    'Secure access to planning, delivery, reporting, and governance across your project portfolio.'}
                </p>
              </div>
            </div>

            <div className="grid gap-3 lg:grid-cols-2 lg:gap-4">
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-sm lg:rounded-[24px] lg:p-5">
                <div className="flex items-center gap-2 text-sm font-medium text-slate-100">
                  <Building2 className="h-4 w-4" />
                  White-label identity
                </div>
                <p className="mt-2 text-sm leading-6 text-slate-300">
                  Product naming, login messaging, support paths, and collaboration surfaces now follow project branding.
                </p>
              </div>

              <div className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-sm lg:rounded-[24px] lg:p-5">
                <div className="text-sm font-medium text-slate-100">Support</div>
                {supportLinks.length > 0 ? (
                  <div className="mt-3 space-y-2">
                    {supportLinks.map((link) => {
                      const Icon = link.icon
                      const external = !link.href.startsWith('mailto:')

                      return (
                        <Link
                          key={link.href}
                          href={link.href}
                          target={external ? '_blank' : undefined}
                          rel={external ? 'noreferrer' : undefined}
                          className="flex items-center gap-2 text-sm text-slate-200 transition hover:text-white"
                        >
                          <Icon className="h-4 w-4" />
                          <span className="truncate">{link.label}</span>
                        </Link>
                      )
                    })}
                  </div>
                ) : (
                  <p className="mt-2 text-sm leading-6 text-slate-300">
                    Configure help center, support portal, or support email in project branding to surface them here.
                  </p>
                )}
              </div>
            </div>
          </div>
        </section>

        <section className="flex items-center justify-center px-0 sm:px-4 md:px-0">
          <Card className="w-full max-w-md overflow-hidden border bg-background/95 backdrop-blur md:max-w-xl" style={cardStyle}>
            <div className="h-1.5 w-full" style={{ backgroundColor: branding.accentColor }} />
            <CardHeader className="space-y-2 pb-3 sm:space-y-3 sm:pb-4">
              <div className="flex items-center gap-3">
                <div
                  className="flex h-11 w-11 items-center justify-center rounded-2xl text-white"
                  style={{ backgroundColor: branding.accentColor }}
                >
                  <FolderKanban className="h-6 w-6" />
                </div>
                <div>
                  <CardTitle className="text-2xl tracking-tight">{title}</CardTitle>
                  <CardDescription className="mt-1 text-sm">{description}</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {children}
              {footer ? <div className="mt-6 border-t border-border/60 pt-4 text-sm">{footer}</div> : null}
            </CardContent>
          </Card>
        </section>
      </div>
    </main>
  )
}