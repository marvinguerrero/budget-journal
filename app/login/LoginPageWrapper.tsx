'use client'

import dynamic from 'next/dynamic'

// Client Component — only here can ssr: false be used with next/dynamic.
// Prevents Chrome autofill (__gcruniqueid injection) from causing
// hydration mismatches, since there is no server-rendered HTML to mismatch.
const LoginClient = dynamic(() => import('./LoginClient'), { ssr: false })

export function LoginPageWrapper() {
  return <LoginClient />
}
