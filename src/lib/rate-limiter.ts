/**
 * Basit rate limiter ve exponential backoff utility
 *
 * Scraper adaptörleri için API çağrı hız kontrolü sağlar.
 */

import { logger } from './logger'

interface RateLimiterConfig {
  requestsPerSecond: number
  maxRetries?: number
  initialBackoffMs?: number
}

/**
 * API çağrıları arasında minimum bekleme süresi uygular
 */
export class RateLimiter {
  private lastRequestTime = 0
  private readonly minIntervalMs: number

  constructor(requestsPerSecond: number) {
    this.minIntervalMs = 1000 / requestsPerSecond
  }

  /**
   * Sonraki isteği yapmadan önce gerekli süre kadar bekle
   */
  async wait(): Promise<void> {
    const now = Date.now()
    const timeSinceLastRequest = now - this.lastRequestTime
    const waitTime = Math.max(0, this.minIntervalMs - timeSinceLastRequest)

    if (waitTime > 0) {
      await new Promise((resolve) => setTimeout(resolve, waitTime))
    }

    this.lastRequestTime = Date.now()
  }
}

/**
 * Exponential backoff ile retry mekanizması
 *
 * @param fn - Çalıştırılacak async fonksiyon
 * @param config - Rate limiter yapılandırması
 * @returns Fonksiyon sonucu
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  config: RateLimiterConfig
): Promise<T> {
  const maxRetries = config.maxRetries ?? 3
  const initialBackoffMs = config.initialBackoffMs ?? 1000
  const rateLimiter = new RateLimiter(config.requestsPerSecond)

  let lastError: Error | null = null

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      await rateLimiter.wait()
      return await fn()
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error))

      // Rate limit hatası (429) veya geçici hata (5xx) için retry
      const isRetryable = isRetryableError(error)

      if (!isRetryable || attempt === maxRetries) {
        throw lastError
      }

      // Exponential backoff with jitter
      const backoffMs = initialBackoffMs * Math.pow(2, attempt)
      const jitter = Math.random() * 0.3 * backoffMs // %30 jitter
      const waitMs = Math.min(backoffMs + jitter, 30000) // Max 30 saniye

      logger.warn('API isteği başarısız, yeniden deneniyor', {
        attempt: attempt + 1,
        maxRetries,
        waitMs: Math.round(waitMs),
        error: lastError.message,
      })

      await new Promise((resolve) => setTimeout(resolve, waitMs))
    }
  }

  throw lastError ?? new Error('Bilinmeyen hata')
}

/**
 * Hata yeniden denenebilir mi?
 */
function isRetryableError(error: unknown): boolean {
  if (error instanceof Error) {
    const message = error.message.toLowerCase()
    // Rate limit, timeout veya geçici sunucu hataları
    return (
      message.includes('429') ||
      message.includes('rate limit') ||
      message.includes('timeout') ||
      message.includes('503') ||
      message.includes('502') ||
      message.includes('econnreset') ||
      message.includes('network')
    )
  }
  return false
}

/**
 * Scraper API'leri için önceden yapılandırılmış rate limiter'lar
 */
export const SCRAPER_RATE_LIMITS = {
  googlePlaces: { requestsPerSecond: 2, maxRetries: 3, initialBackoffMs: 1000 },
  apify: { requestsPerSecond: 1, maxRetries: 2, initialBackoffMs: 2000 },
  instagram: { requestsPerSecond: 0.5, maxRetries: 2, initialBackoffMs: 3000 },
} as const
