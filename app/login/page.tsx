export const dynamic = 'force-dynamic'

import { Suspense } from 'react'
import { LoginPageWrapper } from './LoginPageWrapper'

export default function LoginPage() {
  return (
    <Suspense>
      <LoginPageWrapper />
    </Suspense>
  )
}
