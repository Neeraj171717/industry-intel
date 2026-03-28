'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useSession } from '@/lib/useSession'
import { createBrowserSupabaseClient } from '@/lib/supabase'

const GOLD = '#C9A84C'

const NAV_LINKS = [
  { href: '/super-admin/dashboard', label: 'Dashboard' },
  { href: '/super-admin/spaces',    label: 'Spaces'    },
  { href: '/super-admin/users',     label: 'Users'     },
  { href: '/super-admin/analytics', label: 'Analytics' },
  { href: '/super-admin/system',    label: 'System'    },
  { href: '/super-admin/settings',  label: 'Settings'  },
]

export default function SuperAdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router   = useRouter()
  const { user } = useSession()

  async function handleLogout() {
    await createBrowserSupabaseClient().auth.signOut()
    router.push('/login')
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">

      {/* ── Top navigation bar ─────────────────────────────────────────── */}
      <nav className="bg-white border-b border-gray-200 sticky top-0 z-40">
        <div className="max-w-screen-xl mx-auto px-6 flex items-stretch h-14 gap-8">

          {/* Logo + gold badge */}
          <div className="flex items-center gap-3 flex-shrink-0 mr-2">
            <span className="text-slate-900 font-bold text-lg tracking-tight">Industry Intel</span>
            <span
              className="text-xs font-bold px-2 py-0.5 rounded-full border tracking-wide"
              style={{ color: GOLD, borderColor: GOLD, backgroundColor: '#FEF9EE' }}
            >
              SUPER ADMIN
            </span>
          </div>

          {/* Nav links — stretch to full height for border-bottom effect */}
          <div className="flex items-stretch gap-0.5 flex-1">
            {NAV_LINKS.map(link => {
              const isActive = pathname.startsWith(link.href)
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className="flex items-center px-3 text-sm font-medium border-b-2 transition-colors"
                  style={
                    isActive
                      ? { borderColor: GOLD, color: GOLD }
                      : { borderColor: 'transparent', color: '#6B7280' }
                  }
                  onMouseEnter={e => {
                    if (!isActive) {
                      (e.currentTarget as HTMLAnchorElement).style.color = '#1e293b'
                    }
                  }}
                  onMouseLeave={e => {
                    if (!isActive) {
                      (e.currentTarget as HTMLAnchorElement).style.color = '#6B7280'
                    }
                  }}
                >
                  {link.label}
                </Link>
              )
            })}
          </div>

          {/* Right — admin name + logout */}
          <div className="flex items-center gap-4 flex-shrink-0">
            <span className="text-sm text-slate-700 font-medium">{user?.name}</span>
            <button
              onClick={handleLogout}
              className="text-sm text-gray-400 hover:text-gray-700 transition-colors"
            >
              Logout
            </button>
          </div>
        </div>
      </nav>

      {/* ── Page content ───────────────────────────────────────────────── */}
      <main className="flex-1 overflow-auto">
        {children}
      </main>

    </div>
  )
}
