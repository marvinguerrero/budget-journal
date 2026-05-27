'use client'

import { useState, useEffect } from 'react'
import { SharedGroup } from '@/types'
import { getMySharedGroups, createSharedGroup } from '@/services/sharedGroups'
import { SharedGroupCard } from '@/components/shared/SharedGroupCard'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Plus, Users } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import { toast } from 'sonner'

const PRESET_EMOJIS = ['👥', '🏠', '✈️', '🎉', '💍', '👫', '🍕', '🛒', '🏖️', '💼', '🎓', '🌍']

export default function SharedPage() {
  const [groups, setGroups] = useState<SharedGroup[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [name, setName] = useState('')
  const [emoji, setEmoji] = useState('👥')
  const [isSaving, setIsSaving] = useState(false)

  const load = async () => {
    try {
      const data = await getMySharedGroups()
      setGroups(data)
    } catch {
      toast.error('Failed to load groups')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return
    setIsSaving(true)
    try {
      const group = await createSharedGroup(name, emoji)
      setGroups((prev) => [group, ...prev])
      setShowCreate(false)
      setName('')
      setEmoji('👥')
      toast.success('Group created!')
    } catch {
      toast.error('Failed to create group')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="p-4 lg:p-6 pb-24 lg:pb-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Shared Budgets</h1>
          <p className="text-sm text-muted-foreground">Collaborative budgeting groups</p>
        </div>
        <Button
          type="button"
          size="sm"
          className="h-9 rounded-xl gap-1.5 text-xs"
          onClick={() => setShowCreate(true)}
        >
          <Plus className="w-3.5 h-3.5" />
          New Group
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-28 rounded-2xl" />)}
        </div>
      ) : groups.length === 0 ? (
        <div className="text-center py-20 space-y-3">
          <div className="flex justify-center">
            <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center">
              <Users className="w-8 h-8 text-primary" />
            </div>
          </div>
          <p className="font-semibold">No shared groups yet</p>
          <p className="text-sm text-muted-foreground">
            Create a group to budget with friends, family, or roommates
          </p>
          <Button className="rounded-xl" onClick={() => setShowCreate(true)}>
            <Plus className="w-4 h-4 mr-2" />
            Create your first group
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {groups.map((group) => (
            <SharedGroupCard key={group.id} group={group} />
          ))}
        </div>
      )}

      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="sm:max-w-sm rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold">Create Group</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreate} className="space-y-4">
            <div className="space-y-2">
              <Label className="text-sm font-semibold">Choose an icon</Label>
              <div className="grid grid-cols-6 gap-2">
                {PRESET_EMOJIS.map((e) => (
                  <button
                    key={e}
                    type="button"
                    onClick={() => setEmoji(e)}
                    className={`h-10 w-full rounded-xl text-xl flex items-center justify-center transition-all ${
                      emoji === e
                        ? 'bg-primary/15 ring-2 ring-primary'
                        : 'bg-muted hover:bg-muted/80'
                    }`}
                  >
                    {e}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="groupName" className="text-sm font-semibold">Group Name</Label>
              <Input
                id="groupName"
                placeholder="e.g. Bali Trip 2026"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="h-11 rounded-xl"
                required
              />
            </div>
            <div className="flex gap-3">
              <Button
                type="button"
                variant="outline"
                className="flex-1 h-11 rounded-xl"
                onClick={() => setShowCreate(false)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                className="flex-1 h-11 rounded-xl font-semibold"
                disabled={isSaving || !name.trim()}
              >
                {isSaving ? 'Creating...' : 'Create'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
