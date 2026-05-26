export const dynamic = 'force-dynamic'

import { Suspense } from 'react'
import { RegisterPageWrapper } from './RegisterPageWrapper'

export default function RegisterPage() {
  return (
    <Suspense>
      <RegisterPageWrapper />
    </Suspense>
  )
}
