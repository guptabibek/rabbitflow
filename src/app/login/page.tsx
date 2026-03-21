'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { FolderKanban, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

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

export default function LoginPage() {
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

  const handleLogin = async (event: React.FormEvent) => {
    event.preventDefault()
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
      setMode('login')
    } catch {
      toast.error('Network error. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-br from-background via-background to-muted/30 p-4">
      <div className="w-full max-w-md space-y-6">
        <div className="flex flex-col items-center gap-3">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-primary to-brand-secondary shadow-lg shadow-brand-glow">
            <FolderKanban className="h-8 w-8 text-white" />
          </div>
          <div className="text-center">
            <h1 className="text-2xl font-bold tracking-tight">RabbitFlow</h1>
            <p className="text-sm text-muted-foreground">Agile Project Management</p>
          </div>
        </div>

        <Card className="border-border/50 shadow-xl shadow-black/5">
          <CardHeader className="pb-4">
            <CardTitle className="text-lg">
              {mode === 'login' && 'Sign in to your account'}
              {mode === 'mfa' && (mfaSetupRequired ? 'Set up authenticator app' : 'Authenticator verification')}
              {mode === 'reset-request' && 'Reset your password'}
              {mode === 'reset-confirm' && 'Enter OTP and new password'}
            </CardTitle>
            <CardDescription>
              {mode === 'login' && 'Enter your credentials to continue'}
              {mode === 'mfa' && 'Complete the MFA step to sign in'}
              {mode === 'reset-request' && 'We will send a one-time password to your email'}
              {mode === 'reset-confirm' && 'Use the OTP sent to your email'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {mode === 'login' && (
              <form onSubmit={handleLogin} className="space-y-4">
                <div className="space-y-2">
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
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">Password</Label>
                  <Input
                    id="password"
                    type="password"
                    placeholder="********"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    required
                    autoComplete="current-password"
                  />
                </div>
                <Button type="submit" className="w-full" disabled={isLoading}>
                  {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Sign In
                </Button>
                <Button
                  type="button"
                  variant="link"
                  className="w-full"
                  onClick={() => {
                    setResetEmail(email)
                    setMode('reset-request')
                  }}
                >
                  Forgot password?
                </Button>
              </form>
            )}

            {mode === 'mfa' && (
              <form onSubmit={handleMfaVerify} className="space-y-4">
                {mfaSetupRequired && (
                  <div className="space-y-3 rounded-lg border border-border p-3">
                    <p className="text-xs text-muted-foreground">
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
                <div className="space-y-2">
                  <Label htmlFor="mfa-code">Authenticator code</Label>
                  <Input
                    id="mfa-code"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    placeholder="123456"
                    value={mfaCode}
                    onChange={(event) => setMfaCode(event.target.value)}
                    required
                    autoFocus
                  />
                </div>
                <Button type="submit" className="w-full" disabled={isLoading}>
                  {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Verify & Continue
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  onClick={() => {
                    setMode('login')
                    setMfaChallengeToken('')
                    setMfaCode('')
                  }}
                >
                  Back to sign in
                </Button>
              </form>
            )}

            {mode === 'reset-request' && (
              <form onSubmit={handleRequestPasswordReset} className="space-y-4">
                <div className="space-y-2">
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
                  />
                </div>
                <Button type="submit" className="w-full" disabled={isLoading}>
                  {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Send OTP
                </Button>
                <Button type="button" variant="outline" className="w-full" onClick={() => setMode('login')}>
                  Back to sign in
                </Button>
              </form>
            )}

            {mode === 'reset-confirm' && (
              <form onSubmit={handleConfirmPasswordReset} className="space-y-4">
                <div className="space-y-2">
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
                <div className="space-y-2">
                  <Label htmlFor="reset-otp">Email OTP</Label>
                  <Input
                    id="reset-otp"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    placeholder="123456"
                    value={resetOtp}
                    onChange={(event) => setResetOtp(event.target.value)}
                    required
                    autoFocus
                  />
                </div>
                <div className="space-y-2">
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
                  />
                </div>
                <Button type="submit" className="w-full" disabled={isLoading}>
                  {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Reset Password
                </Button>
                <Button type="button" variant="outline" className="w-full" onClick={() => setMode('login')}>
                  Back to sign in
                </Button>
              </form>
            )}

            {mode === 'login' && (
              <div className="mt-4 text-center text-sm">
                <span className="text-muted-foreground">Don&apos;t have an account? </span>
                <a href="/register" className="font-medium text-primary hover:underline">
                  Register
                </a>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </main>
  )
}
