/**
 * Google PageSpeed Insights adaptörü
 *
 * Website hız analizi, mobil uyumluluk, 404 kontrolü,
 * Meta Pixel ve GA4 algılama, email tarama
 */

import { logger } from '@/lib/logger'

export interface PageSpeedResult {
  speedScore: number | null
  isMobileFriendly: boolean | null
  has404s: boolean | null
  hasMetaPixel: boolean | null
  hasGA4: boolean | null
  emails: string[]
}

interface PageSpeedApiResponse {
  lighthouseResult?: {
    categories?: {
      performance?: { score?: number }
    }
    audits?: {
      viewport?: { score?: number }
      'font-size'?: { score?: number }
      'tap-targets'?: { score?: number }
    }
  }
  loadingExperience?: {
    overall_category?: string
  }
}

const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g

export class PageSpeedAdapter {
  private readonly apiKey: string

  constructor(apiKey?: string) {
    this.apiKey = apiKey ?? process.env.GOOGLE_PLACES_API_KEY ?? ''
  }

  async analyze(websiteUrl: string): Promise<PageSpeedResult> {
    const result: PageSpeedResult = {
      speedScore: null,
      isMobileFriendly: null,
      has404s: null,
      hasMetaPixel: null,
      hasGA4: null,
      emails: [],
    }

    if (!this.apiKey) {
      logger.warn('PageSpeed analizi atlandı: API key yok')
      return result
    }

    const url = websiteUrl.startsWith('http') ? websiteUrl : `https://${websiteUrl}`

    // PageSpeed API + HTML analizi paralel çalıştır
    const [pageSpeedData, htmlData] = await Promise.allSettled([
      this.fetchPageSpeed(url),
      this.fetchHtml(url),
    ])

    // PageSpeed sonuçları
    if (pageSpeedData.status === 'fulfilled' && pageSpeedData.value) {
      const api = pageSpeedData.value
      const perfScore = api.lighthouseResult?.categories?.performance?.score
      if (perfScore !== undefined && perfScore !== null) {
        result.speedScore = Math.round(perfScore * 100)
      }

      // Mobil uyumluluk (viewport + font-size + tap-targets)
      const audits = api.lighthouseResult?.audits
      if (audits) {
        const viewportOk = (audits.viewport?.score ?? 0) >= 0.5
        const fontOk = (audits['font-size']?.score ?? 0) >= 0.5
        const tapOk = (audits['tap-targets']?.score ?? 0) >= 0.5
        result.isMobileFriendly = viewportOk && fontOk && tapOk
      }
    }

    // HTML analizi
    if (htmlData.status === 'fulfilled' && htmlData.value) {
      const html = htmlData.value.html
      const statusCode = htmlData.value.statusCode

      result.has404s = statusCode === 404

      // Meta Pixel algılama
      result.hasMetaPixel = html.includes('fbq(') || html.includes('facebook.com/tr')

      // GA4 algılama
      result.hasGA4 = html.includes('gtag(') || /G-[A-Z0-9]+/.test(html)

      // Email tarama
      const emails = html.match(EMAIL_REGEX) ?? []
      const filteredEmails = [...new Set(emails)].filter(
        (e) => !e.endsWith('.png') && !e.endsWith('.jpg') && !e.includes('example.com')
      )
      result.emails = filteredEmails.slice(0, 5)
    }

    return result
  }

  private async fetchPageSpeed(url: string): Promise<PageSpeedApiResponse | null> {
    try {
      const apiUrl = new URL('https://www.googleapis.com/pagespeedonline/v5/runPagespeed')
      apiUrl.searchParams.set('url', url)
      apiUrl.searchParams.set('key', this.apiKey)
      apiUrl.searchParams.set('strategy', 'mobile')
      apiUrl.searchParams.set('category', 'performance')

      const response = await fetch(apiUrl.toString(), {
        signal: AbortSignal.timeout(15000),
      })

      if (!response.ok) {
        logger.warn('PageSpeed API hatası', { status: response.status, url })
        return null
      }

      return await response.json()
    } catch (error) {
      logger.warn('PageSpeed API erişim hatası', { url, error: String(error) })
      return null
    }
  }

  private async fetchHtml(url: string): Promise<{ html: string; statusCode: number } | null> {
    try {
      const response = await fetch(url, {
        signal: AbortSignal.timeout(5000),
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; CreviaSalesBot/1.0)',
        },
        redirect: 'follow',
      })

      const html = await response.text()
      return { html: html.slice(0, 100000), statusCode: response.status }
    } catch (error) {
      logger.warn('Website HTML alınamadı', { url, error: String(error) })
      return null
    }
  }
}
