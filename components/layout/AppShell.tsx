import { AuthGuard } from '@/components/common/AuthGuard'
import { Sidebar } from './Sidebar'
import { MobileNav } from './MobileNav'
import { Header } from './Header'

interface AppShellProps {
  children: React.ReactNode
  userEmail?: string
}

export function AppShell({ children, userEmail }: AppShellProps) {
  return (
    <AuthGuard>
      <div className="flex min-h-screen bg-background">
        <Sidebar />
        <div className="flex-1 flex flex-col min-w-0">
          <Header userEmail={userEmail} />
          <main className="flex-1 overflow-auto">
            <div className="max-w-5xl mx-auto">
              {children}
            </div>
          </main>
        </div>
        <MobileNav />
      </div>
    </AuthGuard>
  )
}
