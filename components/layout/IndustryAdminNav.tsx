'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import {
  LayoutDashboard, Users, Tag, Globe, Layers,
  BarChart2, Settings, Eye, LogOut,
} from 'lucide-react'
import { createBrowserSupabaseClient } from '@/lib/supabase'
import { logout } from '@/lib/auth'
import { useAppStore } from '@/store'

const NAV_ITEMS = [
  { href: '/industry-admin/dashboard', label: 'Dashboard',         icon: LayoutDashboard },
  { href: '/industry-admin/users',     label: 'Users',             icon: Users           },
  { href: '/industry-admin/tags',      label: 'Tags',              icon: Tag             },
  { href: '/industry-admin/sources',   label: 'Sources',           icon: Globe           },
  { href: '/industry-admin/threads',   label: 'Event Threads',     icon: Layers          },
  { href: '/industry-admin/analytics', label: 'Analytics',         icon: BarChart2       },
  { href: '/industry-admin/settings',  label: 'Settings',          icon: Settings        },
  { href: '/industry-admin/content',   label: 'Content Oversight', icon: Eye             },
]

export function IndustryAdminNav() {
  const pathname = usePathname()
  const router = useRouter()
  const { currentUser, reset } = useAppStore()
  const [spaceName, setSpaceName] = useState<string | null>(null)
  const [confirmLogout, setConfirmLogout] = useState(false)

  useEffect(() => {
    if (!currentUser?.space_id) return
    createBrowserSupabaseClient()
      .from('industry_spaces')
      .select('name')
      .eq('id', currentUser.space_id)
      .single()
      .then(({ data }) => { if (data) setSpaceName(data.name) })
  }, [currentUser?.space_id])

  async function handleLogout() {
    await logout(reset)
    router.push('/login')
  }

  return (
    <nav className="w-60 h-screen bg-[#F8F9FA] border-r border-gray-200 flex flex-col flex-shrink-0 sticky top-0">

      {/* Space name */}
      <div className="px-5 pt-6 pb-5 border-b border-gray-200">
        <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-2">
          Industry Space
        </p>
        <div className="pl-2.5 border-l-2 border-teal-500">
          <p className="text-sm font-bold text-teal-700 leading-tight truncate">
            {spaceName ?? '…'}
          </p>
        </div>
      </div>

      {/* Nav links */}
      <div className="flex-1 overflow-y-auto py-3">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const isActive = pathname.startsWith(href)
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-3 px-5 py-2.5 text-sm transition-colors border-l-2 ${
                isActive
                  ? 'border-teal-500 text-teal-700 bg-teal-50 font-medium'
                  : 'border-transparent text-gray-500 hover:text-slate-800 hover:bg-gray-100'
              }`}
            >
              <Icon size={15} className="flex-shrink-0" />
              {label}
            </Link>
          )
        })}
      </div>

      {/* User + logout */}
      <div className="border-t border-gray-200 px-5 py-4">
        <p className="text-xs text-gray-400 truncate mb-2.5">
          {currentUser?.name ?? ''}
        </p>
        {!confirmLogout ? (
          <button
            onClick={() => setConfirmLogout(true)}
            className="flex items-center gap-2 text-sm text-red-500 hover:text-red-700 transition-colors"
          >
            <LogOut size={13} />
            Log out
          </button>
        ) : (
          <div className="flex items-center gap-2 text-sm">
            <span className="text-gray-500 text-xs">Sure?</span>
            <button onClick={handleLogout} className="text-red-600 font-medium hover:text-red-800 text-xs">Yes</button>
            <button onClick={() => setConfirmLogout(false)} className="text-gray-400 hover:text-gray-600 text-xs">No</button>
          </div>
        )}
      </div>

    </nav>
  )
}
