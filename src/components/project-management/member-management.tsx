'use client'

import { useEffect, useState, useCallback } from 'react'
import { useAppStore, User } from '@/store/app-store'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Search,
  Shield,
  Users,
  UserPlus,
  MoreHorizontal,
  Trash2,
  Inbox,
  Briefcase,
  Bug,
  Wrench,
  Eye,
  Check,
  Plus,
} from 'lucide-react'
import { toast } from 'sonner'

type MemberWithUser = {
  id: string
  role: string
  joinedAt: string
  user: User
}

type GlobalUser = {
  id: string
  name: string
  email: string
  avatar: string | null
  globalRole: string
}

const ROLE_OPTIONS = [
  { value: 'Admin', label: 'Admin', icon: Shield, tone: 'bg-role-admin-bg text-role-admin' },
  { value: 'PM', label: 'PM', icon: Briefcase, tone: 'bg-role-pm-bg text-role-pm' },
  { value: 'Dev', label: 'Developer', icon: Wrench, tone: 'bg-role-dev-bg text-role-dev' },
  { value: 'QA', label: 'QA', icon: Bug, tone: 'bg-role-qa-bg text-role-qa' },
  { value: 'Viewer', label: 'Viewer', icon: Eye, tone: 'bg-role-viewer-bg text-role-viewer' },
] as const

export function MemberManagement({ trigger }: { trigger?: React.ReactNode } = {}) {
  const { currentProject, currentProjectPermissions, currentUser } = useAppStore()
  const [open, setOpen] = useState(false)
  const [members, setMembers] = useState<MemberWithUser[]>([])
  const [loading, setLoading] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [addMemberOpen, setAddMemberOpen] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)

  // Add existing user state
  const [userSearchQuery, setUserSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<GlobalUser[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null)
  const [addRole, setAddRole] = useState<(typeof ROLE_OPTIONS)[number]['value']>('Dev')
  const [isAdding, setIsAdding] = useState(false)

  // Create new user state
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [newUserName, setNewUserName] = useState('')
  const [newUserEmail, setNewUserEmail] = useState('')
  const [newUserPassword, setNewUserPassword] = useState('')
  const [newUserRole, setNewUserRole] = useState<(typeof ROLE_OPTIONS)[number]['value']>('Dev')
  const [assignNewUserToProject, setAssignNewUserToProject] = useState(false)

  const canManageMembers = currentProjectPermissions.includes('project:members:manage')
  const isSystemAdmin = currentUser?.globalRole === 'admin'

  useEffect(() => {
    async function loadMembers() {
      if (!currentProject) return
      setLoading(true)
      try {
        const res = await fetch(`/api/projects/${currentProject.id}/members`)
        if (res.ok) {
          const data = await res.json()
          setMembers(data)
        }
      } catch (error) {
        console.error('Failed to fetch members:', error)
      } finally {
        setLoading(false)
      }
    }

    if (open && currentProject) {
      loadMembers()
    }
  }, [currentProject, open, refreshKey])

  const refreshMembers = () => setRefreshKey((value) => value + 1)

  // Search for global users not in this project
  const searchGlobalUsers = useCallback(
    async (query: string) => {
      if (!currentProject || query.trim().length < 2) {
        setSearchResults([])
        return
      }
      setIsSearching(true)
      try {
        const res = await fetch(
          `/api/users?excludeProjectId=${currentProject.id}&search=${encodeURIComponent(query.trim())}`
        )
        if (res.ok) {
          setSearchResults(await res.json())
        }
      } catch {
        // ignore
      } finally {
        setIsSearching(false)
      }
    },
    [currentProject]
  )

  // Debounced search
  useEffect(() => {
    if (!addMemberOpen || showCreateForm) return
    const timer = setTimeout(() => searchGlobalUsers(userSearchQuery), 300)
    return () => clearTimeout(timer)
  }, [userSearchQuery, addMemberOpen, showCreateForm, searchGlobalUsers])

  // Load initial results when opening add modal
  useEffect(() => {
    if (addMemberOpen && !showCreateForm && currentProject) {
      searchGlobalUsers('')
      // Fetch all non-members initially
      setIsSearching(true)
      fetch(`/api/users?excludeProjectId=${currentProject.id}`)
        .then((res) => (res.ok ? res.json() : []))
        .then(setSearchResults)
        .finally(() => setIsSearching(false))
    }
  }, [addMemberOpen, showCreateForm, currentProject, searchGlobalUsers])

  const handleAddExistingUser = async () => {
    if (!currentProject || !selectedUserId) return
    setIsAdding(true)
    try {
      const res = await fetch(`/api/projects/${currentProject.id}/members`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: selectedUserId, role: addRole }),
      })
      if (!res.ok) {
        const error = await res.json().catch(() => ({}))
        toast.error(error.error || 'Failed to add member')
        return
      }
      toast.success('Member added to project')
      resetAddForm()
      setAddMemberOpen(false)
      refreshMembers()
    } catch {
      toast.error('Failed to add member')
    } finally {
      setIsAdding(false)
    }
  }

  const handleCreateAndAdd = async () => {
    if (!currentProject || !newUserEmail || !newUserName || newUserPassword.length < 8) return
    setIsAdding(true)
    try {
      const res = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: newUserEmail,
          name: newUserName,
          password: newUserPassword,
          addToProject: assignNewUserToProject,
          projectId: assignNewUserToProject ? currentProject.id : undefined,
          projectRole: assignNewUserToProject ? newUserRole : undefined,
        }),
      })
      if (!res.ok) {
        const error = await res.json().catch(() => ({}))
        toast.error(error.error || 'Failed to create user')
        return
      }
      const payload = await res.json().catch(() => ({}))
      const baseMessage = assignNewUserToProject
        ? 'User created and added to project.'
        : 'User created. Add them to a project when ready.'

      if (payload?.emailDelivery?.status === 'queued') {
        toast.success(`${baseMessage} Onboarding email queued.`)
      } else if (payload?.emailDelivery?.status === 'failed') {
        toast.warning(`${baseMessage} ${payload.emailDelivery.message}`)
      } else if (payload?.emailDelivery?.status === 'skipped') {
        toast.warning(`${baseMessage} ${payload.emailDelivery.message}`)
      } else {
        toast.success(baseMessage)
      }
      resetAddForm()
      setAddMemberOpen(false)
      refreshMembers()
    } catch {
      toast.error('Failed to create user')
    } finally {
      setIsAdding(false)
    }
  }

  const resetAddForm = () => {
    setUserSearchQuery('')
    setSearchResults([])
    setSelectedUserId(null)
    setAddRole('Dev')
    setShowCreateForm(false)
    setNewUserName('')
    setNewUserEmail('')
    setNewUserPassword('')
    setNewUserRole('Dev')
    setAssignNewUserToProject(false)
  }

  const handleRemoveMember = async (memberId: string) => {
    if (!currentProject || !confirm('Remove this member from the project?')) return

    try {
      const res = await fetch(`/api/projects/${currentProject.id}/members/${memberId}`, {
        method: 'DELETE',
      })

      if (res.ok) {
        toast.success('Member removed')
        refreshMembers()
      } else {
        const error = await res.json().catch(() => ({}))
        toast.error(error.error || 'Failed to remove member')
      }
    } catch {
      toast.error('Failed to remove member')
    }
  }

  const handleUpdateRole = async (memberId: string, newRole: string) => {
    if (!currentProject) return

    try {
      const res = await fetch(`/api/projects/${currentProject.id}/members/${memberId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: newRole }),
      })

      if (res.ok) {
        toast.success('Role updated')
        refreshMembers()
      } else {
        const error = await res.json().catch(() => ({}))
        toast.error(error.error || 'Failed to update role')
      }
    } catch {
      toast.error('Failed to update role')
    }
  }

  const filteredMembers = members.filter(
    (member) =>
      member.user.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      member.user.email.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const selectedUser = searchResults.find((u) => u.id === selectedUserId)

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs">
            <Users className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Members</span>
            {members.length > 0 && (
              <Badge variant="secondary" className="ml-0.5 h-4 min-w-4 px-1 text-[10px]">
                {members.length}
              </Badge>
            )}
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="flex max-h-[82vh] max-w-lg flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="flex-shrink-0 border-b border-border/70 bg-background/95 px-4 py-4 backdrop-blur md:px-5">
          <DialogTitle className="flex items-center gap-2 text-base font-semibold tracking-tight">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
              <Users className="h-4 w-4 text-primary" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span>Project Members</span>
                {currentProject && (
                  <Badge variant="outline" className="text-[10px] font-normal">
                    {currentProject.name}
                  </Badge>
                )}
              </div>
              <div className="mt-0.5 text-xs font-normal text-muted-foreground">
                Compact access management for project membership and roles.
              </div>
            </div>
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-1 flex-col overflow-hidden">
          <div className="flex items-center gap-2 border-b border-border/60 bg-muted/15 px-4 py-3 md:px-5">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Search members..."
                className="h-9 pl-8 text-xs"
              />
            </div>

            {canManageMembers && (
              <Dialog
                open={addMemberOpen}
                onOpenChange={(v) => {
                  setAddMemberOpen(v)
                  if (!v) resetAddForm()
                }}
              >
                <DialogTrigger asChild>
                  <Button size="sm" className="h-9 gap-1.5 text-xs">
                    <UserPlus className="h-3.5 w-3.5" />
                    Add
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-md gap-0 overflow-hidden p-0">
                  <DialogHeader className="border-b border-border/70 bg-background/95 px-4 py-4 backdrop-blur md:px-5">
                    <DialogTitle className="text-base font-semibold tracking-tight">
                      {showCreateForm ? 'Create New User' : 'Add Member to Project'}
                    </DialogTitle>
                  </DialogHeader>

                  {!showCreateForm ? (
                    /* ── Add existing user ─────────────────────────── */
                    <div className="space-y-3 px-4 py-4 md:px-5">
                      <div>
                        <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-muted-foreground">
                          Search Users
                        </label>
                        <div className="relative">
                          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                          <Input
                            value={userSearchQuery}
                            onChange={(e) => {
                              setUserSearchQuery(e.target.value)
                              setSelectedUserId(null)
                            }}
                            placeholder="Search by name or email..."
                            className="h-9 pl-8 text-sm"
                          />
                        </div>
                      </div>

                      <ScrollArea className="max-h-[200px]">
                        {isSearching ? (
                          <div className="space-y-1.5 py-1">
                            {Array.from({ length: 3 }).map((_, i) => (
                              <div key={i} className="flex items-center gap-2.5 px-2 py-1.5">
                                <Skeleton className="h-7 w-7 rounded-full" />
                                <div className="flex-1 space-y-1">
                                  <Skeleton className="h-3 w-24" />
                                  <Skeleton className="h-2.5 w-36" />
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : searchResults.length === 0 ? (
                          <div className="flex flex-col items-center py-6 text-muted-foreground">
                            <Users className="mb-1.5 h-6 w-6 opacity-40" />
                            <p className="text-xs">
                              {userSearchQuery.trim().length >= 2
                                ? 'No matching users found'
                                : 'All users are already project members'}
                            </p>
                          </div>
                        ) : (
                          <div className="space-y-0.5 py-1">
                            {searchResults.map((user) => (
                              <button
                                key={user.id}
                                onClick={() => setSelectedUserId(user.id)}
                                className={`flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left transition-colors ${
                                  selectedUserId === user.id
                                    ? 'bg-primary/10 ring-1 ring-primary/30'
                                    : 'hover:bg-accent/50'
                                }`}
                              >
                                <Avatar className="h-7 w-7">
                                  <AvatarImage src={user.avatar || undefined} />
                                  <AvatarFallback className="bg-primary/10 text-[9px] font-medium text-primary">
                                    {user.name
                                      .split(' ')
                                      .map((s) => s[0])
                                      .join('')
                                      .toUpperCase()}
                                  </AvatarFallback>
                                </Avatar>
                                <div className="min-w-0 flex-1">
                                  <div className="truncate text-sm font-medium">{user.name}</div>
                                  <div className="truncate text-[11px] text-muted-foreground">
                                    {user.email}
                                  </div>
                                </div>
                                {selectedUserId === user.id && (
                                  <Check className="h-4 w-4 flex-shrink-0 text-primary" />
                                )}
                              </button>
                            ))}
                          </div>
                        )}
                      </ScrollArea>

                      {selectedUserId && (
                        <div>
                          <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-muted-foreground">
                            Project Role
                          </label>
                          <Select
                            value={addRole}
                            onValueChange={(v) =>
                              setAddRole(v as (typeof ROLE_OPTIONS)[number]['value'])
                            }
                          >
                            <SelectTrigger className="h-9 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {ROLE_OPTIONS.map((role) => (
                                <SelectItem key={role.value} value={role.value}>
                                  <span className="flex items-center gap-1.5">
                                    <role.icon className="h-3 w-3" />
                                    {role.label}
                                  </span>
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      )}

                      <Button
                        className="h-9 w-full text-xs"
                        onClick={handleAddExistingUser}
                        disabled={!selectedUserId || isAdding}
                      >
                        {isAdding ? 'Adding...' : `Add ${selectedUser?.name ?? 'User'} to Project`}
                      </Button>

                      {isSystemAdmin && (
                        <>
                          <div className="relative">
                            <div className="absolute inset-0 flex items-center">
                              <span className="w-full border-t border-border" />
                            </div>
                            <div className="relative flex justify-center text-[10px] uppercase">
                              <span className="bg-background px-2 text-muted-foreground">
                                or
                              </span>
                            </div>
                          </div>
                          <Button
                            variant="outline"
                            className="h-9 w-full gap-1.5 border-dashed text-xs"
                            onClick={() => setShowCreateForm(true)}
                          >
                            <Plus className="h-3.5 w-3.5" />
                            Create New User Account
                          </Button>
                        </>
                      )}
                    </div>
                  ) : (
                    /* ── Create new user ───────────────────────────── */
                    <div className="space-y-3 px-4 py-4 md:px-5">
                      <div>
                        <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-muted-foreground">
                          Name
                        </label>
                        <Input
                          value={newUserName}
                          onChange={(e) => setNewUserName(e.target.value)}
                          placeholder="John Doe"
                          className="h-9 text-sm"
                        />
                      </div>
                      <div>
                        <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-muted-foreground">
                          Email
                        </label>
                        <Input
                          type="email"
                          value={newUserEmail}
                          onChange={(e) => setNewUserEmail(e.target.value)}
                          placeholder="john@example.com"
                          className="h-9 text-sm"
                        />
                      </div>
                      <label className="flex items-center gap-2 rounded-md border border-border px-2.5 py-2 text-xs">
                        <input
                          type="checkbox"
                          checked={assignNewUserToProject}
                          onChange={(event) => setAssignNewUserToProject(event.target.checked)}
                        />
                        Add this user to current project immediately
                      </label>
                      {assignNewUserToProject && (
                        <div>
                          <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-muted-foreground">
                            Project Role
                          </label>
                          <Select
                            value={newUserRole}
                            onValueChange={(v) =>
                              setNewUserRole(v as (typeof ROLE_OPTIONS)[number]['value'])
                            }
                          >
                            <SelectTrigger className="h-9 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {ROLE_OPTIONS.map((role) => (
                                <SelectItem key={role.value} value={role.value}>
                                  {role.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      )}
                      <div>
                        <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-muted-foreground">
                          Temporary Password
                        </label>
                        <Input
                          type="password"
                          value={newUserPassword}
                          onChange={(e) => setNewUserPassword(e.target.value)}
                          placeholder="Minimum 8 characters"
                          className="h-9 text-sm"
                        />
                      </div>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          className="h-9 flex-1 text-xs"
                          onClick={() => setShowCreateForm(false)}
                        >
                          Back
                        </Button>
                        <Button
                          className="h-9 flex-1 text-xs"
                          onClick={handleCreateAndAdd}
                          disabled={
                            !newUserEmail || !newUserName || newUserPassword.length < 8 || isAdding
                          }
                        >
                          {isAdding
                            ? 'Creating...'
                            : assignNewUserToProject
                              ? 'Create & Add'
                              : 'Create User'}
                        </Button>
                      </div>
                    </div>
                  )}
                </DialogContent>
              </Dialog>
            )}
          </div>

          <ScrollArea className="max-h-[400px] flex-1">
            <div className="px-5 py-2">
              {loading ? (
                <div className="space-y-2">
                  {Array.from({ length: 4 }).map((_, index) => (
                    <div key={index} className="flex items-center gap-3 p-2.5">
                      <Skeleton className="h-8 w-8 rounded-full" />
                      <div className="flex-1 space-y-1.5">
                        <Skeleton className="h-3.5 w-28" />
                        <Skeleton className="h-3 w-40" />
                      </div>
                      <Skeleton className="h-5 w-14 rounded-full" />
                    </div>
                  ))}
                </div>
              ) : filteredMembers.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                  <Inbox className="mb-2 h-8 w-8 opacity-40" />
                  <p className="text-sm font-medium">No members found</p>
                  <p className="mt-0.5 text-xs">Add project members to get started</p>
                </div>
              ) : (
                <div className="space-y-0.5">
                  {filteredMembers.map((member) => {
                    const role =
                      ROLE_OPTIONS.find((option) => option.value === member.role) ??
                      ROLE_OPTIONS.find((option) => option.value === 'Viewer')!
                    const RoleIcon = role.icon

                    return (
                      <div
                        key={member.id}
                        className="group flex items-center justify-between rounded-md px-2.5 py-2 transition-colors hover:bg-accent/50"
                      >
                        <div className="flex items-center gap-2.5">
                          <Avatar className="h-8 w-8">
                            <AvatarImage src={member.user.avatar || undefined} />
                            <AvatarFallback className="bg-primary/10 text-[10px] font-medium text-primary">
                              {member.user.name
                                .split(' ')
                                .map((segment) => segment[0])
                                .join('')
                                .toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="truncate text-sm font-medium">
                                {member.user.name}
                              </span>
                              <RoleIcon className="h-3 w-3 flex-shrink-0 text-muted-foreground" />
                            </div>
                            <div className="text-[11px] text-muted-foreground">
                              {member.user.email}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5">
                          <Badge variant="outline" className={`border-transparent text-[10px] ${role.tone}`}>
                            {role.label}
                          </Badge>

                          {canManageMembers && (
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  aria-label="Member options"
                                  className="h-6 w-6 opacity-0 transition-opacity group-hover:opacity-100"
                                >
                                  <MoreHorizontal className="h-3.5 w-3.5" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="w-44">
                                {ROLE_OPTIONS.filter((option) => option.value !== member.role).map(
                                  (option) => (
                                    <DropdownMenuItem
                                      key={option.value}
                                      onClick={() => handleUpdateRole(member.id, option.value)}
                                    >
                                      <option.icon className="mr-2 h-3.5 w-3.5" />
                                      Make {option.label}
                                    </DropdownMenuItem>
                                  )
                                )}
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  className="text-destructive focus:text-destructive"
                                  onClick={() => handleRemoveMember(member.id)}
                                >
                                  <Trash2 className="mr-2 h-3.5 w-3.5" />
                                  Remove
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </ScrollArea>
        </div>
      </DialogContent>
    </Dialog>
  )
}
