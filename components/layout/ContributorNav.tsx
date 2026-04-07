'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createBrowserSupabaseClient } from '@/lib/supabase'
import { logout } from '@/lib/auth'
import { useAppStore } from '@/store'

const NAV_LINKS = [
  { href: '/contributor/dashboard', label: 'Dashboard' },
  { href: '/contributor/submit', label: 'Submit' },
  { href: '/contributor/bulk-import', label: 'Bulk Import' },
  { href: '/contributor/history', label: 'History' },
]

export function ContributorNav() {
  const pathname = usePathname()
  const router = useRouter()
  const { currentUser, reset } = useAppStore()
  const [spaceName, setSpaceName] = useState<string | null>(null)
  const [confirmLogout, setConfirmLogout] = useState(false)

  useEffect(() => {
    if (!currentUser?.space_id) return
    const supabase = createBrowserSupabaseClient()
    supabase
      .from('industry_spaces')
      .select('name')
      .eq('id', currentUser.space_id)
      .single()
      .then(({ data }: { data: { name: string } | null }) => { if (data) setSpaceName(data.name) })
  }, [currentUser?.space_id])

  async function handleLogout() {
    await logout(reset)
    router.push('/login')
  }

  const firstName = currentUser?.name?.split(' ')[0] ?? ''

  return (
    <nav className="bg-white border-b border-gray-200 sticky top-0 z-40">
      <div className="max-w-5xl mx-auto px-6 h-14 flex items-center justify-between gap-6">

        {/* Left: Logo + space badge */}
        <div className="flex items-center gap-2.5 flex-shrink-0">
          <Link href="/contributor/dashboard" className="text-base font-bold text-slate-900 tracking-tight">
            Industry Intel
          </Link>
          {spaceName && (
            <span className="text-xs bg-gray-100 text-gray-500 px-2.5 py-0.5 rounded-full font-medium">
              {spaceName}
            </span>
          )}
        </div>

        {/* Centre: Nav links */}
        <div className="flex items-center gap-6">
          {NAV_LINKS.map(({ href, label }) => {
            const isActive = pathname.startsWith(href)
            return (
              <Link
                key={href}
                href={href}
                className={`text-sm font-medium transition-colors pb-0.5 ${
                  isActive
                    ? 'text-slate-900 border-b-2 border-slate-900'
                    : 'text-gray-500 hover:text-slate-700'
                }`}
              >
                {label}
              </Link>
            )
          })}
        </div>

        {/* Right: Name + logout */}
        <div className="flex items-center gap-3 flex-shrink-0">
          {firstName && (
            <span className="text-sm text-gray-400">{firstName}</span>
          )}
          {!confirmLogout ? (
            <button
              onClick={() => setConfirmLogout(true)}
              className="text-sm text-red-500 hover:text-red-700 transition-colors"
            >
              Log out
            </button>
          ) : (
            <div className="flex items-center gap-2 text-sm">
              <span className="text-gray-500">Sure?</span>
              <button onClick={handleLogout} className="text-red-600 font-medium hover:text-red-800">Yes</button>
              <button onClick={() => setConfirmLogout(false)} className="text-gray-400 hover:text-gray-600">No</button>
            </div>
          )}
        </div>

      </div>
    </nav>
  )
}
