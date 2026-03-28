import { IndustryAdminNav } from '@/components/layout/IndustryAdminNav'

export default function IndustryAdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen overflow-hidden bg-white">
      <IndustryAdminNav />
      <main className="flex-1 overflow-y-auto">
        {children}
      </main>
    </div>
  )
}
