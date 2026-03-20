'use client'

import { useEffect, useMemo, useState } from 'react'
import { useAppStore, type Team, type User } from '@/store/app-store'
import {
  Dialog,
  DialogContent,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import {
  ArrowLeft,
  Plus,
  Save,
  Shield,
  Trash2,
  Users,
} from 'lucide-react'
import { toast } from 'sonner'

const NONE_VALUE = '__none__'
const DEFAULT_TEAM_COLOR = '#0f766e'

const MEMBER_ROLE_OPTIONS = [
  { value: 'lead', label: 'Lead' },
  { value: 'member', label: 'Member' },
  { value: 'developer', label: 'Developer' },
  { value: 'qa', label: 'QA' },
  { value: 'pm', label: 'PM' },
] as const

type TeamForm = {
  id: string | null
  name: string
  key: string
  description: string
  color: string
  leadId: string
  memberRoles: Record<string, string>
}

type TeamManagementMode = 'dialog' | 'screen'

type TeamManagementProps = {
  trigger?: React.ReactNode
  mode?: TeamManagementMode
  onClose?: () => void
}

const EMPTY_FORM: TeamForm = {
  id: null,
  name: '',
  key: '',
  description: '',
  color: DEFAULT_TEAM_COLOR,
  leadId: NONE_VALUE,
  memberRoles: {},
}

function teamToForm(team: Team): TeamForm {
  return {
    id: team.id,
    name: team.name,
    key: team.key ?? '',
    description: team.description ?? '',
    color: team.color,
    leadId: team.leadId ?? NONE_VALUE,
    memberRoles: Object.fromEntries(
      team.members.map((member) => [member.userId, member.role || 'member'])
    ),
  }
}

function buildMembersPayload(form: TeamForm) {
  const members = new Map<string, string>()

  for (const [userId, role] of Object.entries(form.memberRoles)) {
    members.set(
      userId,
      form.leadId !== NONE_VALUE && userId === form.leadId
        ? 'lead'
        : role === 'lead'
          ? 'member'
          : role || 'member'
    )
  }

  if (form.leadId !== NONE_VALUE) {
    members.set(form.leadId, 'lead')
  }

  return Array.from(members.entries()).map(([userId, role]) => ({
    userId,
    role,
  }))
}

export function TeamManagement({
  trigger,
  mode = 'dialog',
  onClose,
}: TeamManagementProps = {}) {
  const { currentProject, teams, setTeams, users } = useAppStore()
  const [open, setOpen] = useState(false)
  const isScreenMode = mode === 'screen'
  const isVisible = isScreenMode || open
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null)
  const [form, setForm] = useState<TeamForm>(EMPTY_FORM)
  const [isLoading, setIsLoading] = useState(false)
  const [isSaving, setIsSaving] = useState(false)

  const sortedUsers = useMemo(
    () => [...users].sort((left, right) => left.name.localeCompare(right.name)),
    [users]
  )

  const sortedTeams = useMemo(
    () => [...teams].sort((left, right) => left.name.localeCompare(right.name)),
    [teams]
  )

  const loadTeams = async () => {
    if (!currentProject) {
      return
    }

    setIsLoading(true)
    try {
      const response = await fetch(`/api/teams?projectId=${currentProject.id}`)
      if (!response.ok) {
        const error = await response.json().catch(() => ({}))
        toast.error(error.error || 'Failed to load teams')
        return
      }

      const payload = await response.json()
      setTeams(payload)

      if (!selectedTeamId && payload.length > 0) {
        setSelectedTeamId(payload[0].id)
        setForm(teamToForm(payload[0]))
      }
    } catch (caughtError) {
      console.error('Failed to load teams:', caughtError)
      toast.error('Failed to load teams')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    if (!isVisible || !currentProject) {
      return
    }

    void loadTeams()
  }, [currentProject, isVisible])

  useEffect(() => {
    if (!selectedTeamId) {
      return
    }

    const selectedTeam = sortedTeams.find((team) => team.id === selectedTeamId)
    if (selectedTeam) {
      setForm(teamToForm(selectedTeam))
    }
  }, [selectedTeamId, sortedTeams])

  const resetForCreate = () => {
    setSelectedTeamId(null)
    setForm(EMPTY_FORM)
  }

  const handleMemberToggle = (userId: string, checked: boolean) => {
    setForm((previous) => {
      const nextRoles = { ...previous.memberRoles }
      if (checked) {
        nextRoles[userId] = nextRoles[userId] ?? 'member'
      } else {
        delete nextRoles[userId]
      }

      const nextLeadId =
        previous.leadId === userId && !checked ? NONE_VALUE : previous.leadId

      return {
        ...previous,
        memberRoles: nextRoles,
        leadId: nextLeadId,
      }
    })
  }

  const handleSave = async () => {
    if (!currentProject || !form.name.trim()) {
      return
    }

    setIsSaving(true)
    try {
      const payload = {
        projectId: currentProject.id,
        name: form.name.trim(),
        key: form.key.trim() || null,
        description: form.description.trim() || null,
        color: form.color.trim() || DEFAULT_TEAM_COLOR,
        leadId: form.leadId === NONE_VALUE ? null : form.leadId,
        members: buildMembersPayload(form),
      }

      const response = await fetch(
        form.id ? `/api/teams/${form.id}` : '/api/teams',
        {
          method: form.id ? 'PUT' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        }
      )

      if (!response.ok) {
        const error = await response.json().catch(() => ({}))
        toast.error(error.error || 'Failed to save team')
        return
      }

      const team = await response.json()
      const nextTeams = form.id
        ? teams.map((existingTeam) => (existingTeam.id === team.id ? team : existingTeam))
        : [...teams, team]

      setTeams(nextTeams)
      setSelectedTeamId(team.id)
      setForm(teamToForm(team))
      toast.success(form.id ? 'Team updated' : 'Team created')
    } catch (caughtError) {
      console.error('Failed to save team:', caughtError)
      toast.error('Failed to save team')
    } finally {
      setIsSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!form.id || !confirm('Delete this team? Existing sprint ownership must be reassigned first.')) {
      return
    }

    try {
      const response = await fetch(`/api/teams/${form.id}`, { method: 'DELETE' })
      if (!response.ok) {
        const error = await response.json().catch(() => ({}))
        toast.error(error.error || 'Failed to delete team')
        return
      }

      const nextTeams = teams.filter((team) => team.id !== form.id)
      setTeams(nextTeams)
      if (nextTeams.length > 0) {
        setSelectedTeamId(nextTeams[0].id)
        setForm(teamToForm(nextTeams[0]))
      } else {
        resetForCreate()
      }
      toast.success('Team deleted')
    } catch (caughtError) {
      console.error('Failed to delete team:', caughtError)
      toast.error('Failed to delete team')
    }
  }

  const selectedMemberIds = new Set(Object.keys(form.memberRoles))

  if (!currentProject) {
    return null
  }

  const header = (
    <div className="border-b border-border px-5 py-3.5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-base font-semibold">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary/10">
            <Shield className="h-4 w-4 text-primary" />
          </div>
          Team Management
        </div>
        {isScreenMode && onClose && (
          <Button variant="outline" size="sm" className="h-8 gap-1.5" onClick={onClose}>
            <ArrowLeft className="h-3.5 w-3.5" />
            Back
          </Button>
        )}
      </div>
    </div>
  )

  const content = (
    <div className={`flex ${isScreenMode ? 'min-h-0 flex-1' : 'h-[calc(88vh-60px)]'}`}>
      <div className="w-80 border-r border-border bg-muted/5 p-4">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Teams
            </p>
            <p className="text-[11px] text-muted-foreground">
              Iteration ownership and team membership
            </p>
          </div>
          <Button size="sm" className="h-7 gap-1 text-xs" onClick={resetForCreate}>
            <Plus className="h-3.5 w-3.5" />
            New
          </Button>
        </div>

        <ScrollArea className={`${isScreenMode ? 'h-[calc(100vh-240px)]' : 'h-[calc(88vh-160px)]'} pr-2`}>
          <div className="space-y-2">
            {sortedTeams.map((team) => (
              <button
                key={team.id}
                type="button"
                className={`w-full rounded-lg border px-3 py-3 text-left transition-colors ${
                  selectedTeamId === team.id
                    ? 'border-primary bg-primary/5'
                    : 'border-border/60 bg-background hover:bg-accent/40'
                }`}
                onClick={() => setSelectedTeamId(team.id)}
              >
                <div className="mb-2 flex items-center gap-2">
                  <div
                    className="h-3 w-3 rounded-full"
                    style={{ backgroundColor: team.color }}
                  />
                  <span className="truncate text-sm font-medium">{team.name}</span>
                </div>
                <div className="flex flex-wrap gap-1">
                  {team.key ? (
                    <Badge variant="outline" className="text-[10px] font-mono">
                      {team.key}
                    </Badge>
                  ) : null}
                  <Badge variant="secondary" className="text-[10px]">
                    {team.members.length} members
                  </Badge>
                  <Badge variant="secondary" className="text-[10px]">
                    {team._count?.iterations ?? 0} iterations
                  </Badge>
                </div>
              </button>
            ))}

            {!isLoading && sortedTeams.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border/80 bg-background p-5 text-center">
                <Users className="mx-auto mb-2 h-6 w-6 text-muted-foreground/40" />
                <p className="text-sm font-medium">No teams yet</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Create a team before assigning sprint ownership.
                </p>
              </div>
            ) : null}
          </div>
        </ScrollArea>
      </div>

      <ScrollArea className="flex-1">
        <div className="space-y-6 p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-base font-semibold">
                {form.id ? 'Edit Team' : 'Create Team'}
              </h3>
              <p className="text-sm text-muted-foreground">
                Manage iteration ownership, lead assignment, and team membership.
              </p>
            </div>
            <div className="flex items-center gap-2">
              {form.id ? (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 gap-1.5 text-xs text-destructive"
                  onClick={handleDelete}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Delete
                </Button>
              ) : null}
              <Button
                size="sm"
                className="h-8 gap-1.5 text-xs"
                onClick={handleSave}
                disabled={isSaving || !form.name.trim()}
              >
                <Save className="h-3.5 w-3.5" />
                {isSaving ? 'Saving...' : form.id ? 'Save Team' : 'Create Team'}
              </Button>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <Label htmlFor="team-name">Name</Label>
              <Input
                id="team-name"
                value={form.name}
                onChange={(event) =>
                  setForm((previous) => ({ ...previous, name: event.target.value }))
                }
                className="mt-1.5"
              />
            </div>
            <div>
              <Label htmlFor="team-key">Key</Label>
              <Input
                id="team-key"
                value={form.key}
                onChange={(event) =>
                  setForm((previous) => ({
                    ...previous,
                    key: event.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, ''),
                  }))
                }
                className="mt-1.5 font-mono"
                maxLength={20}
              />
            </div>
            <div>
              <Label htmlFor="team-color">Color</Label>
              <Input
                id="team-color"
                value={form.color}
                onChange={(event) =>
                  setForm((previous) => ({ ...previous, color: event.target.value }))
                }
                className="mt-1.5"
              />
            </div>
            <div>
              <Label>Lead</Label>
              <Select
                value={form.leadId}
                onValueChange={(value) =>
                  setForm((previous) => ({ ...previous, leadId: value }))
                }
              >
                <SelectTrigger className="mt-1.5">
                  <SelectValue placeholder="No lead assigned" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE_VALUE}>No lead assigned</SelectItem>
                  {sortedUsers.map((user) => (
                    <SelectItem key={user.id} value={user.id}>
                      {user.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label htmlFor="team-description">Description</Label>
            <Textarea
              id="team-description"
              value={form.description}
              onChange={(event) =>
                setForm((previous) => ({
                  ...previous,
                  description: event.target.value,
                }))
              }
              rows={3}
              className="mt-1.5"
            />
          </div>

          <div className="space-y-3">
            <div>
              <h4 className="text-sm font-semibold">Members</h4>
              <p className="text-xs text-muted-foreground">
                Only project members can belong to a team.
              </p>
            </div>

            <div className="rounded-xl border border-border/70">
              <div className="grid grid-cols-[1fr_140px_120px] gap-3 border-b border-border/70 px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                <span>Member</span>
                <span>Team Role</span>
                <span>Lead</span>
              </div>
              <div className="divide-y">
                {sortedUsers.map((user: User) => {
                  const selected = selectedMemberIds.has(user.id)
                  const roleValue = form.memberRoles[user.id] ?? 'member'

                  return (
                    <div
                      key={user.id}
                      className="grid grid-cols-[1fr_140px_120px] gap-3 px-4 py-3"
                    >
                      <label className="flex items-center gap-3">
                        <Checkbox
                          checked={selected}
                          onCheckedChange={(checked) =>
                            handleMemberToggle(user.id, checked === true)
                          }
                        />
                        <div>
                          <p className="text-sm font-medium">{user.name}</p>
                          <p className="text-xs text-muted-foreground">{user.email}</p>
                        </div>
                      </label>
                      <Select
                        value={roleValue}
                        onValueChange={(value) =>
                          setForm((previous) => ({
                            ...previous,
                            memberRoles: {
                              ...previous.memberRoles,
                              [user.id]: value,
                            },
                          }))
                        }
                        disabled={!selected}
                      >
                        <SelectTrigger className="h-8">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {MEMBER_ROLE_OPTIONS.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button
                        type="button"
                        variant={form.leadId === user.id ? 'default' : 'outline'}
                        size="sm"
                        className="h-8"
                        onClick={() =>
                          setForm((previous) => ({
                            ...previous,
                            leadId:
                              previous.leadId === user.id ? NONE_VALUE : user.id,
                            memberRoles: {
                              ...previous.memberRoles,
                              [user.id]:
                                previous.memberRoles[user.id] ??
                                (previous.leadId === user.id ? 'member' : 'lead'),
                            },
                          }))
                        }
                      >
                        {form.leadId === user.id ? 'Lead' : 'Set Lead'}
                      </Button>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        </div>
      </ScrollArea>
    </div>
  )

  if (isScreenMode) {
    return (
      <div className="flex h-full min-h-0 flex-col bg-background">
        {header}
        {content}
      </div>
    )
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs">
            <Shield className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Teams</span>
            {teams.length > 0 ? (
              <Badge variant="secondary" className="h-4 min-w-4 px-1 text-[10px]">
                {teams.length}
              </Badge>
            ) : null}
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-h-[88vh] max-w-6xl overflow-hidden p-0 gap-0">
        {header}
        {content}
      </DialogContent>
    </Dialog>
  )
}
