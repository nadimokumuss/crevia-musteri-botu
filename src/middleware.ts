import { NextRequest, NextResponse } from 'next/server'

/**
 * Basit in-memory rate limit
 * — Vercel cold start'larda sıfırlanır, sıcak instance'da koruma sağlar
 * — Pahalı endpoint'ler için sıkı limit (admin akışları)
 *
 * Not: Production'da daha güçlü koruma için Upstash Redis kullanılabilir;
 * şimdilik temel DDoS yumuşatması bu yeter.
 */

interface RateLimitConfig {
  windowMs: number
  maxRequests: number
}

// path → (windowMs, maxRequests)
const RATE_LIMITS: Array<{ pattern: RegExp; config: RateLimitConfig }> = [
  // Pahalı: scraper, calls, enrichment — admin tetikler, dakikada 5 yeter
  { pattern: /^\/api\/scraper(\/|$)/, config: { windowMs: 60_000, maxRequests: 5 } },
  { pattern: /^\/api\/calls(\/|$)/, config: { windowMs: 60_000, maxRequests: 30 } },
  { pattern: /^\/api\/leads\/enrich-/, config: { windowMs: 60_000, maxRequests: 5 } },
  { pattern: /^\/api\/leads\/score(\/|$)/, config: { windowMs: 60_000, maxRequests: 5 } },
  // Auth endpoint'i — yetkisiz istekler bile DB'ye gitmesin
  { pattern: /^\/api\/auth(\/|$)/, config: { windowMs: 60_000, maxRequests: 10 } },
  // Audit batch (Outscraper + Sonnet 4.6 — pahalı; admin tetikler)
  { pattern: /^\/api\/audit\/batch(\/|$)/, config: { windowMs: 60_000, maxRequests: 2 } },
  // Tek-lead audit tetik (admin)
  { pattern: /^\/api\/leads\/[^/]+\/audit(\/|$)/, config: { windowMs: 60_000, maxRequests: 5 } },
  // Public audit paylasim sayfasi (no-auth) — kotuye kullanim icin kapsuller
  { pattern: /^\/api\/audit\//, config: { windowMs: 60_000, maxRequests: 60 } },
  // Genel API kuralı
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
  if (!matched) {
    return { allowed: true, resetAt: 0 }
  }

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

// Periyodik temizleme — büyüyen bucket map'i sınırla
function cleanExpiredBuckets() {
  const now = Date.now()
  if (buckets.size > 10_000) {
    for (const [key, bucket] of buckets.entries()) {
      if (bucket.resetAt < now) buckets.delete(key)
    }
  }
}

export function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname
  if (!path.startsWith('/api/')) {
    return NextResponse.next()
  }

  // Cron ve sağlık endpoint'lerini atla
  if (path.startsWith('/api/cron/')) {
    return NextResponse.next()
  }

  cleanExpiredBuckets()

  const clientKey = getClientKey(request)
  const { allowed, resetAt } = checkRateLimit(clientKey, path)

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

  return NextResponse.next()
}

export const config = {
  matcher: ['/api/:path*'],
}
