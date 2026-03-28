'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useSession } from '@/lib/useSession'
import { createBrowserSupabaseClient } from '@/lib/supabase'
import { EndUserNav } from '@/components/layout/EndUserNav'
import Link from 'next/link'

interface ProfileStats {
  read:   number
  saved:  number
  topics: number
}

function initials(name: string): string {
  return name
    .split(' ')
    .slice(0, 2)
    .map(n => n[0])
    .join('')
    .toUpperCase()
}

function formatMemberSince(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
}

export default function ProfilePage() {
  const { user, loading: sessionLoading } = useSession({ required: true })
  const router = useRouter()

  const [stats, setStats]             = useState<ProfileStats>({ read: 0, saved: 0, topics: 0 })
  const [spaceName, setSpaceName]     = useState<string | null>(null)
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false)
  const [loggingOut, setLoggingOut]   = useState(false)

  useEffect(() => {
    if (!user) return
    const supabase = createBrowserSupabaseClient()

    // Stats: read + saved counts
    supabase
      .from('user_interactions')
      .select('action')
      .eq('user_id', user.id)
      .in('action', ['read', 'saved'])
      .then(({ data }) => {
        const read  = (data ?? []).filter(r => r.action === 'read').length
        const saved = (data ?? []).filter(r => r.action === 'saved').length
        setStats(prev => ({ ...prev, read, saved }))
      })

    // Topic count
    supabase
      .from('user_preferences')
      .select('followed_tag_ids')
      .eq('user_id', user.id)
      .maybeSingle()
      .then(({ data }) => {
        const topics = (data?.followed_tag_ids ?? []).length
        setStats(prev => ({ ...prev, topics }))
      })

    // Space name
    if (user.space_id) {
      supabase
        .from('industry_spaces')
        .select('name')
        .eq('id', user.space_id)
        .single()
        .then(({ data }) => setSpaceName(data?.name ?? null))
    }
  }, [user])

  const handleLogout = useCallback(async () => {
    setLoggingOut(true)
    const supabase = createBrowserSupabaseClient()
    await supabase.auth.signOut()
    router.push('/login')
  }, [router])

  const MENU_ITEMS = [
    {
      label: 'Preferences',
      href: '/preferences',
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="4" y1="6" x2="20" y2="6" /><line x1="4" y1="12" x2="20" y2="12" /><line x1="4" y1="18" x2="20" y2="18" />
        </svg>
      ),
    },
    {
      label: 'Notifications',
      href: '/notifications',
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
      ),
    },
    {
      label: 'Help & Support',
      href: 'mailto:support@industryintelligence.com',
      external: true,
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" /><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" /><line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
      ),
    },
  ]

  if (sessionLoading || !user) {
    return (
      <div className="min-h-screen bg-[#0D1117] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-[#00C2A8] border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#0D1117] flex flex-col max-w-[430px] mx-auto">

      <div className="flex-1 overflow-y-auto pb-[72px]">

        {/* ── Profile header ──────────────────────────────────────────── */}
        <div className="flex flex-col items-center pt-10 pb-6 px-6">
          {/* Avatar */}
          <div className="w-20 h-20 rounded-full bg-[#00C2A8] flex items-center justify-center mb-4">
            <span className="text-white font-bold text-[28px]">{initials(user.name)}</span>
          </div>

          {/* Name */}
          <h1 className="text-white font-bold text-[22px] mb-1">{user.name}</h1>

          {/* Space badge */}
          {spaceName && (
            <span className="text-[13px] font-medium px-3 py-1 bg-[#00C2A8]/10 text-[#00C2A8] border border-[#00C2A8]/20 rounded-full mb-2">
              {spaceName}
            </span>
          )}

          {/* Member since */}
          <p className="text-[13px] text-[#444D5A]">
            Member since {formatMemberSince(user.created_at)}
          </p>
        </div>

        {/* ── Stats row ───────────────────────────────────────────────── */}
        <div className="mx-4 bg-[#161B22] rounded-2xl border border-[#1E2530] mb-5">
          <div className="flex">
            {[
              { label: 'Articles Read', value: stats.read },
              { label: 'Saved',         value: stats.saved },
              { label: 'Topics',        value: stats.topics },
            ].map((stat, i) => (
              <div key={stat.label} className={`flex-1 flex flex-col items-center py-4 ${i > 0 ? 'border-l border-[#1E2530]' : ''}`}>
                <span className="text-white font-bold text-[22px]">{stat.value}</span>
                <span className="text-[11px] text-[#444D5A] text-center mt-0.5">{stat.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* ── Menu ────────────────────────────────────────────────────── */}
        <div className="mx-4 bg-[#161B22] rounded-2xl border border-[#1E2530] divide-y divide-[#1E2530] mb-5">
          {MENU_ITEMS.map(item => (
            item.external ? (
              <a
                key={item.label}
                href={item.href}
                className="flex items-center justify-between px-4 py-4 text-[15px] text-[#CCCCCC]"
              >
                <div className="flex items-center gap-3 text-[#888888]">
                  {item.icon}
                  <span className="text-[#CCCCCC]">{item.label}</span>
                </div>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#444D5A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </a>
            ) : (
              <Link
                key={item.label}
                href={item.href}
                className="flex items-center justify-between px-4 py-4 text-[15px] text-[#CCCCCC]"
              >
                <div className="flex items-center gap-3 text-[#888888]">
                  {item.icon}
                  <span className="text-[#CCCCCC]">{item.label}</span>
                </div>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#444D5A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </Link>
            )
          ))}

          {/* Log out */}
          <button
            onClick={() => setShowLogoutConfirm(true)}
            className="w-full flex items-center px-4 py-4 text-[#E84C4C] text-[15px]"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-3">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" />
            </svg>
            Log Out
          </button>
        </div>

        {/* App version */}
        <p className="text-center text-[11px] text-[#2C3444] pb-4">Version 1.0.0</p>
      </div>

      <EndUserNav />

      {/* ── Logout confirm dialog ──────────────────────────────────────── */}
      {showLogoutConfirm && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-[430px] bg-[#161B22] rounded-t-3xl border-t border-[#1E2530] p-6">
            <h3 className="text-white font-bold text-[18px] mb-1">Log out?</h3>
            <p className="text-[#444D5A] text-[14px] mb-6">You will need to log in again to access your feed.</p>
            <button
              onClick={handleLogout}
              disabled={loggingOut}
              className="w-full py-3.5 rounded-xl bg-[#E84C4C] text-white font-semibold text-[15px] mb-3 disabled:opacity-60"
            >
              {loggingOut ? 'Logging out…' : 'Log Out'}
            </button>
            <button
              onClick={() => setShowLogoutConfirm(false)}
              className="w-full py-3.5 rounded-xl border border-[#1E2530] text-[#888888] font-semibold text-[15px]"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
