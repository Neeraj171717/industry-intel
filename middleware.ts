import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import type { UserRole } from '@/types'

const ROLE_HOME: Record<UserRole, string> = {
  super_admin: '/super-admin/dashboard',
  industry_admin: '/industry-admin/dashboard',
  editor: '/editor/inbox',
  contributor: '/contributor/dashboard',
  user: '/feed',
}

const PROTECTED_PREFIXES: Record<string, UserRole> = {
  '/super-admin':   'super_admin',
  '/industry-admin':'industry_admin',
  '/editor':        'editor',
  '/contributor':   'contributor',
  '/library':       'user',
  '/profile':       'user',
  '/preferences':   'user',
  '/setup':         'user',
  '/notifications': 'user',
}

// Paths anonymous visitors can access without login
const ANON_ALLOWED_PREFIXES = ['/feed', '/auth']

const PUBLIC_PATHS = ['/login', '/signup']

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl
  const response = NextResponse.next({
    request: { headers: request.headers },
  })

  // Build a Supabase server client that reads/writes cookies
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            request.cookies.set(name, value)
            response.cookies.set(name, value, options)
          })
        },
      },
    }
  )

  // Refresh the session if expired
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser()

  const isPublicPath = PUBLIC_PATHS.some((p) => pathname.startsWith(p))
  const isAnonAllowed = ANON_ALLOWED_PREFIXES.some((p) => pathname.startsWith(p))

  // Unauthenticated user:
  //   • Public paths (/login, /signup) → allow
  //   • Anonymous-allowed paths (/feed, /feed/article/...) → allow
  //   • Root (/) → send to feed so they land on content instead of login
  //   • Anything else protected → /login
  if (!authUser) {
    if (isPublicPath || isAnonAllowed) {
      return response
    }
    if (pathname === '/') {
      return NextResponse.redirect(new URL('/feed', request.url))
    }
    return NextResponse.redirect(new URL('/login', request.url))
  }

  // Authenticated user hitting a public path → redirect to their home
  if (isPublicPath) {
    // Fetch role from users table — never trust JWT alone
    const { data: userRecord } = await supabase
      .from('users')
      .select('role')
      .eq('id', authUser.id)
      .single()

    if (userRecord?.role) {
      const home = ROLE_HOME[userRecord.role as UserRole]
      return NextResponse.redirect(new URL(home, request.url))
    }
    return response
  }

  // Authenticated non-user roles (editor/admin/super_admin/contributor) visiting
  // an anonymous-allowed path (like /feed) should be sent back to their role home.
  // The /feed page is for consumers — staff should stay in their own consoles.
  if (isAnonAllowed) {
    const { data: userRecord } = await supabase
      .from('users')
      .select('role')
      .eq('id', authUser.id)
      .single()

    if (userRecord?.role && userRecord.role !== 'user') {
      const home = ROLE_HOME[userRecord.role as UserRole] ?? '/login'
      return NextResponse.redirect(new URL(home, request.url))
    }
    // role === 'user' (or unknown) → allow through
    return response
  }

  // Check that the user's role matches the route they are trying to access
  const matchedPrefix = Object.keys(PROTECTED_PREFIXES).find((prefix) =>
    pathname.startsWith(prefix)
  )

  if (matchedPrefix) {
    const requiredRole = PROTECTED_PREFIXES[matchedPrefix]

    // Fetch role from DB — authoritative source
    const { data: userRecord } = await supabase
      .from('users')
      .select('role, status')
      .eq('id', authUser.id)
      .single()

    if (!userRecord) {
      return NextResponse.redirect(new URL('/login', request.url))
    }

    if (userRecord.status === 'pending') {
      return NextResponse.redirect(new URL('/login?status=pending', request.url))
    }

    if (userRecord.status === 'suspended') {
      return NextResponse.redirect(new URL('/login?status=suspended', request.url))
    }

    if (userRecord.status !== 'active') {
      return NextResponse.redirect(new URL('/login', request.url))
    }

    if (userRecord.role !== requiredRole) {
      const home = ROLE_HOME[userRecord.role as UserRole] ?? '/login'
      return NextResponse.redirect(new URL(home, request.url))
    }
  }

  return response
}

export const config = {
  matcher: [
    '/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
