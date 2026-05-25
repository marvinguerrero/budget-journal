'use client'

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useTransition,
  useCallback,
} from 'react'
import type { User, Session } from '@supabase/supabase-js'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

interface AuthContextValue {
  user: User | null
  session: Session | null
  loading: boolean
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  session: null,
  loading: true,
  signOut: async () => {},
})

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const [, startTransition] = useTransition()
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    // onAuthStateChange fires immediately with the current session —
    // no separate getSession() call needed.
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, currentSession) => {
      setSession(currentSession)
      setUser(currentSession?.user ?? null)
      setLoading(false)

      // Re-validate server-side data whenever the JWT is silently refreshed.
      // This keeps server components in sync without forcing a full page reload.
      if (event === 'TOKEN_REFRESHED') {
        startTransition(() => router.refresh())
      }
    })

    return () => subscription.unsubscribe()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const signOut = useCallback(async () => {
    await supabase.auth.signOut()
    // Hard-navigate so all React state is cleared and the proxy
    // re-validates the (now absent) session from scratch.
    window.location.href = '/login'
  }, [supabase])

  return (
    <AuthContext.Provider value={{ user, session, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
