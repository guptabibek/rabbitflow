'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { AuthShell } from '@/components/auth/auth-shell'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { type ResolvedProjectBranding } from '@/lib/domain/project-branding'

function toErrorMessage(value: unknown, fallback: string): string {
  if (typeof value === 'string' && value.trim()) return value
  if (Array.isArray(value) && value.length > 0) {
    const first = value[0] as { message?: unknown }
    if (typeof first?.message === 'string' && first.message.trim()) {
      return first.message
    }
  }
  if (
    value &&
    typeof value === 'object' &&
    'message' in value &&
    typeof (value as { message?: unknown }).message === 'string'
  ) {
    return (value as { message: string }).message
  }
  return fallback
}

type LoginExperienceProps = {
  branding: ResolvedProjectBranding
}

export function LoginExperience({ branding }: LoginExperienceProps) {
  const MFA_CODE_MIN_LENGTH = 6
  const MFA_CODE_MAX_LENGTH = 12
  const RESET_OTP_LENGTH = 6
  const router = useRouter()
  const [mode, setMode] = useState<'login' | 'mfa' | 'reset-request' | 'reset-confirm'>('login')

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [mfaCode, setMfaCode] = useState('')
  const [mfaChallengeToken, setMfaChallengeToken] = useState('')
  const [mfaSetupRequired, setMfaSetupRequired] = useState(false)
  const [mfaQrCodeDataUrl, setMfaQrCodeDataUrl] = useState('')
  const [mfaManualEntryKey, setMfaManualEntryKey] = useState('')

  const [resetEmail, setResetEmail] = useState('')
  const [resetOtp, setResetOtp] = useState('')
  const [resetPassword, setResetPassword] = useState('')
  const [isLoading, setIsLoading] = useState(false)

  const resetMfaState = () => {
    setMfaCode('')
    setMfaChallengeToken('')
    setMfaSetupRequired(false)
    setMfaQrCodeDataUrl('')
    setMfaManualEntryKey('')
  }

  const handleLogin = async (event: React.FormEvent) => {
    event.preventDefault()
    resetMfaState()
    setIsLoading(true)
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })

      if (!response.ok) {
        const data = await response.json()

        if (data?.code === 'PASSWORD_RESET_REQUIRED') {
          setResetEmail(email.trim())
          setMode('reset-request')
          toast.error('You must reset your password before signing in.')
          return
        }

        if (data?.code === 'ACCOUNT_LOCKED') {
          toast.error(toErrorMessage(data?.error, 'Account temporarily locked'))
          return
        }

        toast.error(toErrorMessage(data?.error, 'Login failed'))
        return
      }

      const payload = await response.json()

      if (payload?.mfaRequired && payload?.challengeToken) {
        setMfaChallengeToken(payload.challengeToken)
        setMfaSetupRequired(Boolean(payload.setupRequired))
        setMfaQrCodeDataUrl(payload.qrCodeDataUrl || '')
        setMfaManualEntryKey(payload.manualEntryKey || '')
        setMfaCode('')
        setMode('mfa')
        toast.success(
          payload.setupRequired
            ? 'Set up your authenticator app and verify your code'
            : 'Enter your authenticator code to complete login'
        )
        return
      }

      resetMfaState()
      router.push('/dashboard')
      router.refresh()
    } catch {
      toast.error('Network error. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  const handleMfaVerify = async (event: React.FormEvent) => {
    event.preventDefault()
    setIsLoading(true)
    try {
      const response = await fetch('/api/auth/mfa/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ challengeToken: mfaChallengeToken, code: mfaCode }),
      })

      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        if (
          typeof payload?.error === 'string' &&
          payload.error.toLowerCase().includes('please sign in again')
        ) {
          resetMfaState()
          setMode('login')
        }
        toast.error(toErrorMessage(payload?.error, 'MFA verification failed'))
        return
      }

      router.push('/dashboard')
      router.refresh()
    } catch {
      toast.error('Network error. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  const handleRequestPasswordReset = async (event: React.FormEvent) => {
    event.preventDefault()
    setIsLoading(true)
    try {
      const response = await fetch('/api/auth/password-reset/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: resetEmail }),
      })

      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        toast.error(toErrorMessage(payload?.error, 'Failed to send password reset OTP'))
        return
      }

      toast.success('If the account exists, an OTP has been sent to your email')
      setMode('reset-confirm')
    } catch {
      toast.error('Network error. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  const handleConfirmPasswordReset = async (event: React.FormEvent) => {
    event.preventDefault()
    setIsLoading(true)
    try {
      const response = await fetch('/api/auth/password-reset/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: resetEmail,
          otp: resetOtp,
          newPassword: resetPassword,
        }),
      })

      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        toast.error(toErrorMessage(payload?.error, 'Failed to reset password'))
        return
      }

      toast.success('Password reset successful. You can now sign in.')
      setPassword('')
      setResetOtp('')
      setResetPassword('')
      resetMfaState()
      setMode('login')
    } catch {
      toast.error('Network error. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  const titles = {
    login: `Sign in to ${branding.displayName}`,
    mfa: mfaSetupRequired ? 'Set up your authenticator app' : 'Authenticator verification',
    'reset-request': 'Reset your password',
    'reset-confirm': 'Enter OTP and new password',
  }

  const descriptions = {
    login: 'Enter your credentials to continue into your project workspace.',
    mfa: 'Complete the MFA step to finish signing in.',
    'reset-request': 'We will send a one-time password to your email address.',
    'reset-confirm': 'Use the OTP sent to your email and choose a new password.',
  }

  return (
    <AuthShell
      branding={branding}
      title={titles[mode]}
      description={descriptions[mode]}
      footer={null}
    >
      {mode === 'login' && (
        <form onSubmit={handleLogin} className="space-y-5" data-testid="login-form">
          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
              autoFocus
              autoComplete="email"
              data-testid="login-email-input"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              placeholder="********"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
              autoComplete="current-password"
              data-testid="login-password-input"
            />
          </div>
          <div className="space-y-3 pt-1">
            <Button type="submit" className="w-full" loading={isLoading} data-testid="login-submit-button">
              Sign In
            </Button>
            <Button
              type="button"
              variant="link"
              className="w-full text-xs"
              onClick={() => {
                resetMfaState()
                setResetEmail(email)
                setMode('reset-request')
              }}
              data-testid="login-forgot-password-button"
            >
              Forgot password?
            </Button>
          </div>
        </form>
      )}

      {mode === 'mfa' && (
        <form onSubmit={handleMfaVerify} className="space-y-5" data-testid="login-mfa-form">
          {mfaSetupRequired && (
            <div className="space-y-3 rounded-xl border border-border/70 bg-muted/20 p-4">
              <p className="text-xs leading-relaxed text-muted-foreground">
                Scan this QR in Google Authenticator, Microsoft Authenticator, or Authy.
              </p>
              {mfaQrCodeDataUrl ? (
                <img src={mfaQrCodeDataUrl} alt="Authenticator QR" className="mx-auto h-40 w-40 rounded bg-white p-2" />
              ) : null}
              <div className="text-xs">
                <span className="text-muted-foreground">Manual key: </span>
                <span className="font-mono break-all">{mfaManualEntryKey}</span>
              </div>
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="mfa-code">Authenticator code</Label>
            <Input
              id="mfa-code"
              inputMode="numeric"
              pattern="[0-9]*"
              placeholder="123456"
              value={mfaCode}
              onChange={(event) =>
                setMfaCode(event.target.value.replace(/\D/g, '').slice(0, MFA_CODE_MAX_LENGTH))
              }
              required
              minLength={MFA_CODE_MIN_LENGTH}
              maxLength={MFA_CODE_MAX_LENGTH}
              autoFocus
              autoComplete="one-time-code"
              data-testid="login-mfa-code-input"
            />
          </div>
          <div className="flex flex-col gap-2 pt-1">
            <Button type="submit" className="w-full" loading={isLoading} data-testid="login-mfa-submit-button">
              Verify and Continue
            </Button>
            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={() => {
                resetMfaState()
                setMode('login')
              }}
            >
              Back to sign in
            </Button>
          </div>
        </form>
      )}

      {mode === 'reset-request' && (
        <form onSubmit={handleRequestPasswordReset} className="space-y-5" data-testid="password-reset-request-form">
          <div className="space-y-1.5">
            <Label htmlFor="reset-email">Email</Label>
            <Input
              id="reset-email"
              type="email"
              placeholder="you@example.com"
              value={resetEmail}
              onChange={(event) => setResetEmail(event.target.value)}
              required
              autoFocus
              autoComplete="email"
              data-testid="password-reset-email-input"
            />
          </div>
          <div className="flex flex-col gap-2 pt-1">
            <Button type="submit" className="w-full" loading={isLoading} data-testid="password-reset-request-submit-button">
              Send OTP
            </Button>
            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={() => {
                resetMfaState()
                setMode('login')
              }}
            >
              Back to sign in
            </Button>
          </div>
        </form>
      )}

      {mode === 'reset-confirm' && (
        <form onSubmit={handleConfirmPasswordReset} className="space-y-5" data-testid="password-reset-confirm-form">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="confirm-email">Email</Label>
              <Input
                id="confirm-email"
                type="email"
                value={resetEmail}
                onChange={(event) => setResetEmail(event.target.value)}
                required
                autoComplete="email"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="reset-otp">Email OTP</Label>
              <Input
                id="reset-otp"
                inputMode="numeric"
                pattern="[0-9]*"
                placeholder="123456"
                value={resetOtp}
                onChange={(event) =>
                  setResetOtp(event.target.value.replace(/\D/g, '').slice(0, RESET_OTP_LENGTH))
                }
                required
                minLength={RESET_OTP_LENGTH}
                maxLength={RESET_OTP_LENGTH}
                autoFocus
                autoComplete="one-time-code"
                data-testid="password-reset-otp-input"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="new-password">New password</Label>
            <Input
              id="new-password"
              type="password"
              placeholder="At least 8 characters"
              value={resetPassword}
              onChange={(event) => setResetPassword(event.target.value)}
              required
              minLength={8}
              autoComplete="new-password"
              data-testid="password-reset-new-password-input"
            />
          </div>
          <div className="flex flex-col gap-2 pt-1">
            <Button type="submit" className="w-full" loading={isLoading} data-testid="password-reset-confirm-submit-button">
              Reset Password
            </Button>
            <Button type="button" variant="outline" className="w-full" onClick={() => setMode('login')}>
              Back to sign in
            </Button>
          </div>
        </form>
      )}
    </AuthShell>
  )
}