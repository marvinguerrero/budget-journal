import { InsightsTabs } from '@/components/layout/InsightsTabs'

export default async function WishlistLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <InsightsTabs />
      {children}
    </>
  )
}
