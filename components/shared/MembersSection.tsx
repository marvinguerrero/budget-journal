'use client'

import { useState } from 'react'
import { SharedGroupMember, PermissionRequest } from '@/types'
import { MemberCapabilities } from '@/lib/permissions'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { Plus, X, CheckCircle2, XCircle, Crown, Check } from 'lucide-react'

const REQUEST_LABELS: Record<string, string> = {
  edit_access: 'Edit Budget Access',
  invite_permission: 'Invite Permission',
}

// ── CapabilityToggle ─────────────────────────────────────────
function CapabilityToggle({
  label,
  active,
  activeColor,
  onClick,
}: {
  label: string
  active: boolean
  activeColor: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full font-medium transition-colors',
        active ? activeColor : 'bg-muted text-muted-foreground hover:text-foreground'
      )}
    >
      {active && <Check className="w-2.5 h-2.5" />}
      {label}
    </button>
  )
}

// ── CapabilityBadge (read-only) ──────────────────────────────
function CapabilityBadge({ label, color }: { label: string; color: string }) {
  return (
    <span className={cn('text-xs px-2.5 py-1 rounded-full font-medium', color)}>
      {label}
    </span>
  )
}

// ── MemberRow ────────────────────────────────────────────────
interface MemberRowProps {
  email: string
  isOwner?: boolean
  isCurrentUser: boolean
  canEditBudget?: boolean
  canInviteMembers?: boolean
  canManage: boolean
  onToggleEditBudget?: () => void
  onToggleInvite?: () => void
  onRemove?: () => void
}

function MemberRow({
  email, isOwner, isCurrentUser, canEditBudget, canInviteMembers,
  canManage, onToggleEditBudget, onToggleInvite, onRemove,
}: MemberRowProps) {
  return (
    <div className="flex items-start gap-3 px-4 py-3">
      <div className={cn(
        'w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5',
        isOwner
          ? 'bg-amber-500/20 text-amber-600 dark:text-amber-400'
          : 'bg-muted text-muted-foreground'
      )}>
        {isOwner ? <Crown className="w-3.5 h-3.5" /> : email[0]?.toUpperCase()}
      </div>

      <div className="flex-1 min-w-0 space-y-1.5">
        <div className="flex items-center gap-1.5 flex-wrap">
          <p className="text-sm font-medium leading-none">
            {email.split('@')[0]}
            {isCurrentUser && (
              <span className="text-muted-foreground text-xs ml-1.5">(you)</span>
            )}
          </p>
        </div>
        <p className="text-xs text-muted-foreground">{email}</p>

        {/* Capability display */}
        {isOwner ? (
          <CapabilityBadge label="Owner" color="bg-amber-500/15 text-amber-600 dark:text-amber-400" />
        ) : canManage ? (
          /* Toggles for owner to manage */
          <div className="flex gap-1.5 flex-wrap">
            <CapabilityToggle
              label="Edit Budget"
              active={!!canEditBudget}
              activeColor="bg-blue-500 text-white"
              onClick={() => onToggleEditBudget?.()}
            />
            <CapabilityToggle
              label="Invite Members"
              active={!!canInviteMembers}
              activeColor="bg-violet-500 text-white"
              onClick={() => onToggleInvite?.()}
            />
          </div>
        ) : (
          /* Read-only badges for non-owners */
          <div className="flex gap-1.5 flex-wrap">
            {canEditBudget && (
              <CapabilityBadge label="Edit Budget" color="bg-blue-500/15 text-blue-600 dark:text-blue-400" />
            )}
            {canInviteMembers && (
              <CapabilityBadge label="Invite Members" color="bg-violet-500/15 text-violet-600 dark:text-violet-400" />
            )}
            {!canEditBudget && !canInviteMembers && (
              <CapabilityBadge label="Member" color="bg-muted text-muted-foreground" />
            )}
          </div>
        )}
      </div>

      {canManage && !isOwner && onRemove && (
        <button
          type="button"
          onClick={onRemove}
          className="w-6 h-6 rounded-lg flex items-center justify-center text-muted-foreground hover:text-destructive transition-colors flex-shrink-0 mt-1"
          aria-label="Remove member"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  )
}

// ── MembersSection ───────────────────────────────────────────
interface Props {
  ownerEmail: string
  members: SharedGroupMember[]
  requests: PermissionRequest[]
  currentUserId: string
  currentUserEmail: string
  myPerms: MemberCapabilities
  isOwner: boolean
  onInvite: () => void
  onUpdatePermissions: (memberId: string, canEditBudget: boolean, canInviteMembers: boolean) => void
  onRemoveMember: (member: SharedGroupMember) => void
  onApproveRequest: (requestId: string) => void
  onRejectRequest: (requestId: string) => void
  onCreateRequest: (type: 'edit_access' | 'invite_permission') => void
}

export function MembersSection({
  ownerEmail, members, requests, currentUserId, currentUserEmail,
  myPerms, isOwner, onInvite, onUpdatePermissions, onRemoveMember,
  onApproveRequest, onRejectRequest, onCreateRequest,
}: Props) {
  const [requestingType, setRequestingType] = useState<string | null>(null)

  const pendingRequests = requests.filter((r) => r.status === 'pending')
  const myPending = requests.filter((r) => r.user_id === currentUserId)
  const hasEditReq   = myPending.some((r) => r.type === 'edit_access')
  const hasInviteReq = myPending.some((r) => r.type === 'invite_permission')

  const handleCreateRequest = async (type: 'edit_access' | 'invite_permission') => {
    setRequestingType(type)
    try { await onCreateRequest(type) }
    finally { setRequestingType(null) }
  }

  const myMember = members.find((m) => m.user_id === currentUserId)

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-sm">Members</h2>
        {myPerms.canInviteMembers && (
          <Button type="button" size="sm" variant="outline"
            className="h-8 rounded-xl text-xs gap-1.5" onClick={onInvite}>
            <Plus className="w-3.5 h-3.5" />
            Invite
          </Button>
        )}
      </div>

      {/* Member list */}
      <div className="rounded-2xl border border-border bg-card overflow-hidden divide-y divide-border">
        <MemberRow
          email={isOwner ? currentUserEmail : ownerEmail}
          isOwner
          isCurrentUser={isOwner}
          canManage={false}
        />
        {members.map((m) => (
          <MemberRow
            key={m.id}
            email={m.email}
            isCurrentUser={m.user_id === currentUserId}
            canEditBudget={m.can_edit_budget}
            canInviteMembers={m.can_invite_members}
            canManage={myPerms.canManagePermissions && m.user_id !== currentUserId}
            onToggleEditBudget={() =>
              onUpdatePermissions(m.id, !m.can_edit_budget, m.can_invite_members)
            }
            onToggleInvite={() =>
              onUpdatePermissions(m.id, m.can_edit_budget, !m.can_invite_members)
            }
            onRemove={() => onRemoveMember(m)}
          />
        ))}
      </div>

      {/* Pending requests — owner only */}
      {myPerms.canManagePermissions && pendingRequests.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            {pendingRequests.length} Pending Request{pendingRequests.length !== 1 ? 's' : ''}
          </p>
          <div className="rounded-2xl border border-border bg-card overflow-hidden divide-y divide-border">
            {pendingRequests.map((req) => (
              <div key={req.id} className="flex items-center gap-3 px-4 py-3">
                <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-xs font-bold flex-shrink-0 text-muted-foreground">
                  {req.user_email[0]?.toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{req.user_email.split('@')[0]}</p>
                  <p className="text-xs text-muted-foreground">Wants: {REQUEST_LABELS[req.type]}</p>
                </div>
                <div className="flex gap-1.5 flex-shrink-0">
                  <Button type="button" size="sm" variant="outline"
                    className="h-7 text-xs rounded-lg gap-1 text-emerald-600 dark:text-emerald-400 border-emerald-300 dark:border-emerald-800 hover:bg-emerald-50 dark:hover:bg-emerald-950/50"
                    onClick={() => onApproveRequest(req.id)}>
                    <CheckCircle2 className="w-3 h-3" />
                    Approve
                  </Button>
                  <Button type="button" size="sm" variant="outline"
                    className="h-7 text-xs rounded-lg gap-1 text-destructive border-destructive/30 hover:bg-destructive/10"
                    onClick={() => onRejectRequest(req.id)}>
                    <XCircle className="w-3 h-3" />
                    Reject
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Request access — members only, per capability */}
      {!isOwner && (!myMember?.can_edit_budget || !myMember?.can_invite_members) && (
        <div className="rounded-2xl border border-dashed border-border p-4 space-y-2.5">
          <p className="text-xs font-semibold text-muted-foreground">Need more access?</p>
          <div className="flex flex-wrap gap-2">
            {!myMember?.can_edit_budget && (
              <Button type="button" size="sm" variant="outline"
                className={cn('h-8 text-xs rounded-xl', hasEditReq && 'opacity-60 cursor-default')}
                onClick={() => !hasEditReq && handleCreateRequest('edit_access')}
                disabled={requestingType === 'edit_access'}>
                {hasEditReq ? '✓ Edit Access Requested' : 'Request Edit Access'}
              </Button>
            )}
            {!myMember?.can_invite_members && (
              <Button type="button" size="sm" variant="outline"
                className={cn('h-8 text-xs rounded-xl', hasInviteReq && 'opacity-60 cursor-default')}
                onClick={() => !hasInviteReq && handleCreateRequest('invite_permission')}
                disabled={requestingType === 'invite_permission'}>
                {hasInviteReq ? '✓ Invite Permission Requested' : 'Request Invite Permission'}
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
