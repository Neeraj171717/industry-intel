'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useCallback } from 'react'
import { Compass, Bookmark, Activity, LogIn, LogOut, Lock, Settings, Bell, HelpCircle } from 'lucide-react'
import { createBrowserSupabaseClient } from '@/lib/supabase'

interface Props {
  isAnon: boolean
  onLockedClick?: () => void
}

export function DesktopSidebar({ isAnon, onLockedClick }: Props) {
  const pathname = usePathname()
  const router = useRouter()

  const handleLogout = useCallback(async () => {
    const supabase = createBrowserSupabaseClient()
    await supabase.auth.signOut()
    router.push('/login')
  }, [router])

  const isActive = (href: string) =>
    pathname === href || (href === '/feed' && pathname.startsWith('/feed'))

  return (
    <aside className="hidden md:flex md:flex-col w-[240px] lg:w-[260px] shrink-0 border-r border-[#1A2030] sticky top-0 h-screen px-4 py-6 gap-1">
      <div className="px-3 pb-6 mb-2 border-b border-[#1A2030]">
        <span className="text-white font-bold text-[18px] tracking-tight">Industry Intel</span>
      </div>

      {/* ── Main nav ─────────────────────────────────────────────── */}
      <SideLink href="/feed" label="Explore" icon={<Compass size={18} />} active={isActive('/feed')} />

      {isAnon ? (
        <button
          onClick={onLockedClick}
          className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-[14px] text-[#555E6E] hover:bg-[#161B22] transition-colors"
        >
          <Lock size={18} />
          <span className="flex-1 text-left">Saved</span>
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#1E2530] text-[#666]">Login</span>
        </button>
      ) : (
        <SideLink href="/library" label="Saved" icon={<Bookmark size={18} />} active={isActive('/library')} />
      )}

      {!isAnon && (
        <SideLink href="/profile" label="Your Activity" icon={<Activity size={18} />} active={isActive('/profile')} />
      )}

      {/* ── Settings group (logged-in only) ──────────────────────── */}
      {!isAnon && (
        <>
          <div className="mx-3 my-2 border-t border-[#1A2030]" />
          <SideLink href="/preferences"  label="Preferences"    icon={<Settings size={18} />} active={isActive('/preferences')} />
          <SideLink href="/notifications" label="Notifications"  icon={<Bell size={18} />}     active={isActive('/notifications')} />
          <a
            href="mailto:support@industryintelligence.com"
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-[14px] font-medium text-[#888888] hover:bg-[#161B22] hover:text-white transition-colors"
          >
            <HelpCircle size={18} />
            Help &amp; Support
          </a>
        </>
      )}

      <div className="flex-1" />

      {isAnon ? (
        <Link
          href="/login"
          className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-[14px] font-medium bg-[#00C2A8] text-white hover:bg-[#00A890] transition-colors"
        >
          <LogIn size={18} />
          Sign In
        </Link>
      ) : (
        <button
          onClick={handleLogout}
          className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-[14px] text-[#888888] hover:bg-[#161B22] hover:text-white transition-colors"
        >
          <LogOut size={18} />
          Logout
        </button>
      )}
    </aside>
  )
}

function SideLink({ href, label, icon, active }: { href: string; label: string; icon: React.ReactNode; active: boolean }) {
  return (
    <Link
      href={href}
      className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-[14px] font-medium transition-colors ${
        active ? 'bg-[#00C2A8]/10 text-[#00C2A8]' : 'text-[#888888] hover:bg-[#161B22] hover:text-white'
      }`}
    >
      {icon}
      {label}
    </Link>
  )
}
