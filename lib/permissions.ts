import type { SharedGroupMember } from '@/types'

export interface MemberCapabilities {
  isOwner: boolean
  canEditBudget: boolean
  canInviteMembers: boolean
  canManagePermissions: boolean
  canAddExpense: boolean
}

export function resolveCapabilities(
  isOwner: boolean,
  member?: SharedGroupMember | null
): MemberCapabilities {
  if (isOwner) {
    return {
      isOwner: true,
      canEditBudget: true,
      canInviteMembers: true,
      canManagePermissions: true,
      canAddExpense: true,
    }
  }
  return {
    isOwner: false,
    canEditBudget: member?.can_edit_budget ?? false,
    canInviteMembers: member?.can_invite_members ?? false,
    canManagePermissions: false,
    canAddExpense: true,
  }
}
