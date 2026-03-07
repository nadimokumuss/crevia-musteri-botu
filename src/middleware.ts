import { type NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import type { AgentRole } from '@/types/database'

const PUBLIC_PATHS = ['/login', '/api/auth', '/auth', '/api/cron']

const PAGE_PERMISSIONS: Record<string, AgentRole[]> = {
  // Dashboard sayfaları
  '/admin': ['ADMIN'],
  '/agents': ['ADMIN'],
  '/hunter': ['ADMIN'],
  '/settings': ['ADMIN', 'FIELD_AGENT', 'TELESALES_AGENT'],
  '/leads': ['ADMIN'],
  '/routes': ['ADMIN', 'FIELD_AGENT'],
  '/calls': ['ADMIN', 'TELESALES_AGENT'],
  '/my/route': ['FIELD_AGENT'],
  '/my/calls': ['FIELD_AGENT', 'TELESALES_AGENT'],
  '/my/leads': ['FIELD_AGENT', 'TELESALES_AGENT'],
  // API endpoint'leri - rol bazlı erişim
  '/api/agents': ['ADMIN'],
  '/api/leads': ['ADMIN'],
  '/api/assignments': ['ADMIN'],
  '/api/routes': ['ADMIN', 'FIELD_AGENT'],
  '/api/calls': ['ADMIN', 'TELESALES_AGENT'],
  '/api/scraper': ['ADMIN'],
  '/api/weekly-plan': ['ADMIN'],
  '/api/daily-plan': ['ADMIN'],
  '/api/districts': ['ADMIN'],
  '/api/analytics': ['ADMIN', 'FIELD_AGENT', 'TELESALES_AGENT'],
  '/api/my': ['FIELD_AGENT', 'TELESALES_AGENT'],
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Public paths - erişim serbest
  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    return NextResponse.next()
  }

  // Statik dosyalar
  if (pathname.startsWith('/_next') || pathname.startsWith('/favicon')) {
    return NextResponse.next()
  }

  // Supabase client oluştur
  let response = NextResponse.next({
    request: { headers: request.headers },
  })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => {
            request.cookies.set(name, value)
          })
          response = NextResponse.next({
            request: { headers: request.headers },
          })
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options)
          })
        },
      },
    }
  )

  // Oturum kontrolü
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  // Geçersiz token hatası — cookie'leri temizle ve login'e yönlendir
  if (authError || !user) {
    // Geçersiz refresh token varsa auth cookie'lerini temizle
    if (authError) {
      const redirectResponse = pathname.startsWith('/api/')
        ? NextResponse.json({ error: 'Yetkisiz erişim' }, { status: 401 })
        : NextResponse.redirect(
            new URL(`/login?redirect=${pathname}`, request.url)
          )

      // Supabase auth cookie'lerini sil
      request.cookies.getAll().forEach(({ name }) => {
        if (name.startsWith('sb-')) {
          redirectResponse.cookies.delete(name)
        }
      })

      return redirectResponse
    }

    // API rotalarında 401 döndür
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Yetkisiz erişim' }, { status: 401 })
    }
    const loginUrl = new URL('/login', request.url)
    loginUrl.searchParams.set('redirect', pathname)
    return NextResponse.redirect(loginUrl)
  }

  // Rol bazlı erişim kontrolü
  const userRole = (user.user_metadata?.role as AgentRole) ?? 'FIELD_AGENT'

  for (const [path, allowedRoles] of Object.entries(PAGE_PERMISSIONS)) {
    if (pathname.startsWith(path) && !allowedRoles.includes(userRole)) {
      if (pathname.startsWith('/api/')) {
        return NextResponse.json({ error: 'Erişim reddedildi' }, { status: 403 })
      }
      const defaultPath = userRole === 'ADMIN' ? '/analytics' : '/my/leads'
      return NextResponse.redirect(new URL(defaultPath, request.url))
    }
  }

  return response
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
