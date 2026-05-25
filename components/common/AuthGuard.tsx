'use client'

import { useAuth } from '@/hooks/useAuth'
import { Wallet } from 'lucide-react'

interface AuthGuardProps {
  children: React.ReactNode
}

/**
 * Renders a full-screen loading spinner while the Supabase session is being
 * hydrated from cookies on the client. Once loading is false the children
 * are shown — the server (proxy) has already guaranteed the user is
 * authenticated before serving this layout, so we never need to redirect here.
 */
export function AuthGuard({ children }: AuthGuardProps) {
  const { loading } = useAuth()

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background gap-4">
        <div className="relative">
          <div className="w-16 h-16 rounded-2xl bg-primary flex items-center justify-center shadow-lg shadow-primary/20">
            <Wallet className="w-8 h-8 text-primary-foreground" />
          </div>
          <span className="absolute -bottom-1 -right-1 w-5 h-5 border-2 border-background bg-primary rounded-full animate-spin border-t-transparent" />
        </div>
        <p className="text-sm text-muted-foreground animate-pulse">Loading your data…</p>
      </div>
    )
  }

  return <>{children}</>
}
