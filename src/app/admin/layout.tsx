import type { ReactNode } from 'react'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { AdminShellLayout } from '@/components/project-management/admin-shell-layout'
import { AUTH_COOKIE } from '@/lib/auth'
import { getAuthenticatedUserFromToken } from '@/lib/domain/auth'

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const cookieStore = await cookies()
  const token = cookieStore.get(AUTH_COOKIE)?.value
  const user = await getAuthenticatedUserFromToken(token)

  if (!user) {
    redirect('/login')
  }

  if (user.globalRole !== 'admin') {
    redirect('/dashboard')
  }

  return (
    <AdminShellLayout
      initialUser={{
        id: user.id,
        email: user.email,
        name: user.name,
        avatar: user.avatar,
        globalRole: user.globalRole,
      }}
    >
      {children}
    </AdminShellLayout>
  )
}
