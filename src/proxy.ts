import { type NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import {
  getAllowedRolesForPath,
  getDefaultPathForRole,
  PUBLIC_PATH_PREFIXES,
} from '@/core/auth/access-control'
import type { AgentRole } from '@/types/database'

/**
 * Basit in-memory rate limit
 * — Vercel cold start'larda sıfırlanır, sıcak instance'da koruma sağlar
 * — Pahalı endpoint'ler için sıkı limit (admin akışları)
 */
interface RateLimitConfig {
  windowMs: number
  maxRequests: number
}

const RATE_LIMITS: Array<{ pattern: RegExp; config: RateLimitConfig }> = [
  { pattern: /^\/api\/scraper(\/|$)/, config: { windowMs: 60_000, maxRequests: 5 } },
  { pattern: /^\/api\/calls(\/|$)/, config: { windowMs: 60_000, maxRequests: 30 } },
  { pattern: /^\/api\/leads\/enrich-/, config: { windowMs: 60_000, maxRequests: 5 } },
  { pattern: /^\/api\/leads\/score(\/|$)/, config: { windowMs: 60_000, maxRequests: 5 } },
  { pattern: /^\/api\/auth(\/|$)/, config: { windowMs: 60_000, maxRequests: 10 } },
  // Audit batch (Outscraper + Sonnet 4.6 — pahalı; admin tetikler)
  { pattern: /^\/api\/audit\/batch(\/|$)/, config: { windowMs: 60_000, maxRequests: 2 } },
  // Tek-lead audit tetik (admin)
  { pattern: /^\/api\/leads\/[^/]+\/audit(\/|$)/, config: { windowMs: 60_000, maxRequests: 5 } },
  // Public audit paylasim sayfasi (no-auth) — kotuye kullanim icin kapsuller
  { pattern: /^\/api\/audit\//, config: { windowMs: 60_000, maxRequests: 60 } },
  { pattern: /^\/api\//, config: { windowMs: 60_000, maxRequests: 200 } },
]

const buckets = new Map<string, { count: number; resetAt: number }>()

function getClientKey(request: NextRequest): string {
  const forwardedFor = request.headers.get('x-forwarded-for')
  const ip = forwardedFor?.split(',')[0]?.trim() || 'unknown'
  return ip
}

function checkRateLimit(key: string, path: string): { allowed: boolean; resetAt: number } {
  const matched = RATE_LIMITS.find((rule) => rule.pattern.test(path))
  if (!matched) return { allowed: true, resetAt: 0 }

  const bucketKey = `${key}:${matched.pattern.source}`
  const now = Date.now()
  const bucket = buckets.get(bucketKey)

  if (!bucket || bucket.resetAt < now) {
    buckets.set(bucketKey, { count: 1, resetAt: now + matched.config.windowMs })
    return { allowed: true, resetAt: now + matched.config.windowMs }
  }
  if (bucket.count >= matched.config.maxRequests) {
    return { allowed: false, resetAt: bucket.resetAt }
  }
  bucket.count++
  return { allowed: true, resetAt: bucket.resetAt }
}

function cleanExpiredBuckets() {
  const now = Date.now()
  if (buckets.size > 10_000) {
    for (const [key, bucket] of buckets.entries()) {
      if (bucket.resetAt < now) buckets.delete(key)
    }
  }
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  // 1) Rate limit — sadece /api/ pathler, cron haric
  if (pathname.startsWith('/api/') && !pathname.startsWith('/api/cron/')) {
    cleanExpiredBuckets()
    const { allowed, resetAt } = checkRateLimit(getClientKey(request), pathname)
    if (!allowed) {
      return NextResponse.json(
        { error: 'Çok fazla istek. Lütfen daha sonra tekrar deneyin.', code: 'RATE_LIMIT' },
        {
          status: 429,
          headers: {
            'Retry-After': Math.ceil((resetAt - Date.now()) / 1000).toString(),
          },
        }
      )
    }
  }

  // 2) Public paths - erişim serbest
  if (PUBLIC_PATH_PREFIXES.some((pathPrefix) => pathname.startsWith(pathPrefix))) {
    return NextResponse.next()
  }

  // 3) Statik dosyalar
  if (pathname.startsWith('/_next') || pathname.startsWith('/favicon')) {
    return NextResponse.next()
  }

  // 4) Supabase client + auth
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

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    if (authError) {
      const redirectResponse = pathname.startsWith('/api/')
        ? NextResponse.json({ error: 'Yetkisiz erişim' }, { status: 401 })
        : NextResponse.redirect(
            new URL(`/login?redirect=${pathname}`, request.url)
          )

      request.cookies.getAll().forEach(({ name }) => {
        if (name.startsWith('sb-')) {
          redirectResponse.cookies.delete(name)
        }
      })

      return redirectResponse
    }

    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Yetkisiz erişim' }, { status: 401 })
    }
    const loginUrl = new URL('/login', request.url)
    loginUrl.searchParams.set('redirect', pathname)
    return NextResponse.redirect(loginUrl)
  }

  // 5) Rol bazlı erişim kontrolü
  const userRole = (user.user_metadata?.role as AgentRole) ?? 'TELESALES_AGENT'
  const allowedRoles = getAllowedRolesForPath(pathname)

  if (allowedRoles && !allowedRoles.includes(userRole)) {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Erişim reddedildi' }, { status: 403 })
    }
    return NextResponse.redirect(new URL(getDefaultPathForRole(userRole), request.url))
  }

  return response
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.[^/]+$).*)'],
}
