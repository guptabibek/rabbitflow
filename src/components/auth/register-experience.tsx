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

type RegisterExperienceProps = {
  branding: ResolvedProjectBranding
}

export function RegisterExperience({ branding }: RegisterExperienceProps) {
  const router = useRouter()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isLoading, setIsLoading] = useState(false)

  const handleRegister = async (event: React.FormEvent) => {
    event.preventDefault()
    setIsLoading(true)
    try {
      const response = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password }),
      })

      const payload = await response.json()

      if (!response.ok) {
        toast.error(toErrorMessage(payload?.error, 'Registration failed'))
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

  return (
    <AuthShell
      branding={branding}
      title={`Create your ${branding.displayName} account`}
      description="Set up your identity once and continue into the workspace immediately after registration."
      footer={
        <div className="text-center">
          <span className="text-muted-foreground">Already have an account? </span>
          <Link href="/login" className="font-medium text-primary hover:underline">
            Sign in
          </Link>
        </div>
      }
    >
      <form onSubmit={handleRegister} className="space-y-5" data-testid="register-form">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="name">Full Name</Label>
            <Input
              id="name"
              placeholder="John Doe"
              value={name}
              onChange={(event) => setName(event.target.value)}
              required
              autoFocus
              autoComplete="name"
              data-testid="register-name-input"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
              autoComplete="email"
              data-testid="register-email-input"
            />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            type="password"
            placeholder="Minimum 8 characters"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
            minLength={8}
            autoComplete="new-password"
            data-testid="register-password-input"
          />
        </div>
        <Button type="submit" className="w-full" disabled={isLoading} data-testid="register-submit-button">
          {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          Create Account
        </Button>
      </form>
    </AuthShell>
  )
}