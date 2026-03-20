'use client'

import { useEffect, useRef, useState } from 'react'
import { useAppStore } from '@/store/app-store'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Separator } from '@/components/ui/separator'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Camera, Lock, Settings, Shield, User } from 'lucide-react'
import { toast } from 'sonner'

interface UserProfileProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function UserProfile({ open, onOpenChange }: UserProfileProps) {
  const { currentUser, setCurrentUser } = useAppStore()
  const [name, setName] = useState(currentUser?.name || '')
  const [email, setEmail] = useState(currentUser?.email || '')
  const [avatar, setAvatar] = useState(currentUser?.avatar || '')
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [isChangingPassword, setIsChangingPassword] = useState(false)
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    if (!currentUser) return
    setName(currentUser.name)
    setEmail(currentUser.email)
    setAvatar(currentUser.avatar || '')
  }, [currentUser, open])

  const handleSaveProfile = async () => {
    if (!currentUser) return
    setIsSaving(true)
    try {
      const res = await fetch(`/api/users/${currentUser.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), email: email.trim(), avatar: avatar.trim() || null }),
      })
      if (res.ok) {
        const updated = await res.json()
        setCurrentUser({ ...currentUser, name: updated.name, email: updated.email, avatar: updated.avatar })
        toast.success('Profile updated')
      } else {
        const err = await res.json().catch(() => ({}))
        toast.error(err.error || 'Failed to update profile')
      }
    } catch {
      toast.error('Network error')
    }
    setIsSaving(false)
  }

  const handleChangePassword = async () => {
    if (newPassword.length < 8) {
      toast.error('Password must be at least 8 characters')
      return
    }
    if (newPassword !== confirmPassword) {
      toast.error('Passwords do not match')
      return
    }
    setIsChangingPassword(true)
    try {
      const res = await fetch(`/api/users/${currentUser?.id}/password`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword, newPassword }),
      })
      if (res.ok) {
        toast.success('Password changed successfully')
        setCurrentPassword('')
        setNewPassword('')
        setConfirmPassword('')
      } else {
        const err = await res.json().catch(() => ({}))
        toast.error(err.error || 'Failed to change password')
      }
    } catch {
      toast.error('Network error')
    }
    setIsChangingPassword(false)
  }

  const handleAvatarUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file || !currentUser) return

    const formData = new FormData()
    formData.append('file', file)

    setIsUploadingAvatar(true)
    try {
      const res = await fetch(`/api/users/${currentUser.id}/avatar`, {
        method: 'POST',
        body: formData,
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        toast.error(err.error || 'Failed to upload avatar')
        return
      }

      const updated = await res.json()
      setAvatar(updated.avatar || '')
      setCurrentUser({
        ...currentUser,
        avatar: updated.avatar,
      })
      toast.success('Avatar updated')
    } catch {
      toast.error('Network error')
    } finally {
      setIsUploadingAvatar(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  if (!currentUser) return null

  const initials = (currentUser.name || 'U')
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg p-0 gap-0">
        <DialogHeader className="px-6 py-5 border-b">
          <DialogTitle className="flex items-center gap-2">
            <User className="h-5 w-5 text-primary" />
            Profile Settings
          </DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="profile" className="w-full">
          <div className="px-6 border-b">
            <TabsList className="h-10 bg-transparent p-0 gap-4 w-full justify-start">
              <TabsTrigger
                value="profile"
                className="gap-1.5 data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-1 pb-2 text-sm"
              >
                <Settings className="h-3.5 w-3.5" /> Profile
              </TabsTrigger>
              <TabsTrigger
                value="security"
                className="gap-1.5 data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-1 pb-2 text-sm"
              >
                <Lock className="h-3.5 w-3.5" /> Security
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="profile" className="p-6 mt-0 space-y-6">
            {/* Avatar section */}
            <div className="flex items-center gap-4">
              <div className="relative">
              <Avatar className="h-16 w-16">
                <AvatarImage src={avatar || undefined} />
                <AvatarFallback className="text-lg bg-primary/10 text-primary">{initials}</AvatarFallback>
              </Avatar>
                <Button
                  type="button"
                  size="icon"
                  variant="secondary"
                  className="absolute -bottom-1 -right-1 h-8 w-8 rounded-full"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploadingAvatar}
                >
                  <Camera className="h-3.5 w-3.5" />
                </Button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleAvatarUpload}
                />
              </div>
              <div>
                <h3 className="font-semibold">{currentUser.name}</h3>
                <p className="text-sm text-muted-foreground">{currentUser.email}</p>
                <Badge variant="secondary" className="mt-1 text-xs capitalize">
                  <Shield className="h-3 w-3 mr-1" />
                  {currentUser.globalRole}
                </Badge>
              </div>
            </div>

            <Separator />

            {/* Edit fields */}
            <div className="space-y-4">
              <div>
                <Label>Full Name</Label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="mt-1.5"
                />
              </div>
              <div>
                <Label>Email</Label>
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="mt-1.5"
                />
              </div>
              <div>
                <Label>Avatar URL</Label>
                <Input
                  value={avatar}
                  onChange={(e) => setAvatar(e.target.value)}
                  placeholder="https://example.com/avatar.png"
                  className="mt-1.5"
                />
                <p className="text-xs text-muted-foreground mt-1">Paste an image URL or use the camera button to upload an avatar</p>
              </div>
              <Button onClick={handleSaveProfile} disabled={isSaving} className="w-full">
                {isSaving ? 'Saving...' : 'Save Changes'}
              </Button>
            </div>
          </TabsContent>

          <TabsContent value="security" className="p-6 mt-0 space-y-4">
            <div>
              <h3 className="font-semibold mb-1">Change Password</h3>
              <p className="text-sm text-muted-foreground">Update your password to keep your account secure</p>
            </div>

            <Separator />

            <div className="space-y-4">
              <div>
                <Label>Current Password</Label>
                <Input
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  className="mt-1.5"
                />
              </div>
              <div>
                <Label>New Password</Label>
                <Input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Minimum 8 characters"
                  className="mt-1.5"
                />
              </div>
              <div>
                <Label>Confirm New Password</Label>
                <Input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="mt-1.5"
                />
              </div>
              <Button
                onClick={handleChangePassword}
                disabled={isChangingPassword || !currentPassword || !newPassword || !confirmPassword}
                className="w-full"
              >
                {isChangingPassword ? 'Changing...' : 'Change Password'}
              </Button>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}
