'use client'

import { useRouter } from 'next/navigation'
import { UserProfile } from '@/components/project-management'

export default function ProfilePage() {
  const router = useRouter()

  return (
    <div className="min-h-screen bg-background">
      <UserProfile open onOpenChange={(open) => !open && router.push('/')} />
    </div>
  )
}
