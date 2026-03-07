/**
 * Instagram profil analizci adaptörü
 *
 * Apify'ın Instagram Scraper actor'unu kullanarak profil verisi çeker.
 */

import type { ILeadSource, LeadSourceQuery, LeadSourceResult } from './lead-source.interface'
import type { RawLeadData } from '@/types/lead'
import { ExternalServiceError } from '@/lib/errors'
import { logger } from '@/lib/logger'
import { verifyInstagramMatch, type VerifyContext, type VerifiableProfile } from '@/lib/instagram-utils'
import { RateLimiter, SCRAPER_RATE_LIMITS } from '@/lib/rate-limiter'

interface InstagramProfileData {
  username: string
  fullName?: string
  biography?: string
  followersCount?: number
  postsCount?: number
  highlightReelCount?: number
  isBusinessAccount?: boolean
  externalUrl?: string
  latestPosts?: {
    likesCount?: number
    timestamp?: string
  }[]
}

interface ApifyInstagramRunResponse {
  data: {
    id: string
    status: string
    defaultDatasetId: string
  }
}

const AGENCY_KEYWORDS = [
  'ajans', 'agency', 'dijital', 'digital', 'reklam',
  'pazarlama', 'marketing', 'medya', 'media', 'creative',
  'kreatif', 'tasarım', 'design', 'sosyal medya', 'social media',
]

export class InstagramAdapter implements ILeadSource {
  readonly name = 'instagram'
  private readonly apiToken: string
  private readonly baseUrl = 'https://api.apify.com/v2'
  private readonly actorId = 'apify~instagram-profile-scraper'
  private readonly rateLimiter: RateLimiter

  constructor(apiToken?: string) {
    this.apiToken = apiToken ?? process.env.APIFY_API_TOKEN ?? ''
    this.rateLimiter = new RateLimiter(SCRAPER_RATE_LIMITS.instagram.requestsPerSecond)
  }

  async search(query: LeadSourceQuery): Promise<LeadSourceResult> {
    if (!this.apiToken) {
      throw new ExternalServiceError('Instagram', 'API token yapılandırılmamış')
    }

    try {
      // Instagram'da konum + kategori bazlı hashtag araması yap
      const searchTerm = query.category ?? 'işletme'
      const actorInput = {
        search: searchTerm,
        searchType: 'place',
        searchLimit: query.limit ?? 20,
        resultsLimit: query.limit ?? 20,
      }

      // Rate limiting: API çağrıları arasında minimum bekleme süresi
      await this.rateLimiter.wait()

      const runResponse = await fetch(
        `${this.baseUrl}/acts/apify~instagram-scraper/runs?token=${this.apiToken}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(actorInput),
        }
      )

      if (!runResponse.ok) {
        throw new ExternalServiceError('Instagram', `Actor başlatılamadı: HTTP ${runResponse.status}`)
      }

      const runData: ApifyInstagramRunResponse = await runResponse.json()
      const datasetId = await this.waitForCompletion(runData.data.id)

      // Rate limiting: API çağrıları arasında minimum bekleme süresi
      await this.rateLimiter.wait()

      const dataResponse = await fetch(
        `${this.baseUrl}/datasets/${datasetId}/items?token=${this.apiToken}&format=json`
      )

      if (!dataResponse.ok) {
        throw new ExternalServiceError('Instagram', `Veri alınamadı: HTTP ${dataResponse.status}`)
      }

      const profiles: InstagramProfileData[] = await dataResponse.json()
      const leads: RawLeadData[] = profiles
        .filter((p) => p.username)
        .map((p) => this.profileToLead(p))

      logger.info('Instagram arama tamamlandı', {
        districtId: query.districtId,
        totalFound: leads.length,
      })

      return { leads, totalFound: leads.length, source: this.name }
    } catch (error) {
      if (error instanceof ExternalServiceError) throw error
      throw new ExternalServiceError(
        'Instagram',
        error instanceof Error ? error.message : 'Bilinmeyen hata'
      )
    }
  }

  private profileToLead(profile: InstagramProfileData): RawLeadData {
    const partial = this.mapToRawLeadPartial(profile)
    return {
      businessName: profile.fullName ?? profile.username,
      ...partial,
    }
  }

  /**
   * Belirli bir Instagram kullanıcı adı için profil verisi çek
   */
  async analyzeProfile(username: string): Promise<Partial<RawLeadData>> {
    if (!this.apiToken) {
      throw new ExternalServiceError('Instagram', 'API token yapılandırılmamış')
    }

    try {
      // Rate limiting: API çağrıları arasında minimum bekleme süresi
      await this.rateLimiter.wait()

      const runResponse = await fetch(
        `${this.baseUrl}/acts/${this.actorId}/runs?token=${this.apiToken}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            usernames: [username],
          }),
        }
      )

      if (!runResponse.ok) {
        throw new ExternalServiceError('Instagram', `Actor başlatılamadı: HTTP ${runResponse.status}`)
      }

      const runData: ApifyInstagramRunResponse = await runResponse.json()
      const datasetId = await this.waitForCompletion(runData.data.id)

      // Rate limiting: API çağrıları arasında minimum bekleme süresi
      await this.rateLimiter.wait()

      const dataResponse = await fetch(
        `${this.baseUrl}/datasets/${datasetId}/items?token=${this.apiToken}&format=json`
      )

      if (!dataResponse.ok) {
        throw new ExternalServiceError('Instagram', `Veri alınamadı: HTTP ${dataResponse.status}`)
      }

      const profiles: InstagramProfileData[] = await dataResponse.json()

      if (profiles.length === 0) {
        return { igUsername: username }
      }

      const profile = profiles[0]
      return this.mapToRawLeadPartial(profile)
    } catch (error) {
      if (error instanceof ExternalServiceError) throw error
      throw new ExternalServiceError(
        'Instagram',
        error instanceof Error ? error.message : 'Bilinmeyen hata'
      )
    }
  }

  /**
   * Aday kullanıcı adlarını tek Apify run'ında doğrula.
   * İlk eşleşen profili döner, hiçbiri eşleşmezse null.
   */
  async findBusinessProfile(
    candidates: string[],
    businessName: string,
    context: VerifyContext
  ): Promise<Partial<RawLeadData> | null> {
    if (!this.apiToken || candidates.length === 0) return null

    try {
      // Rate limiting: API çağrıları arasında minimum bekleme süresi
      await this.rateLimiter.wait()

      const runResponse = await fetch(
        `${this.baseUrl}/acts/${this.actorId}/runs?token=${this.apiToken}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ usernames: candidates }),
        }
      )

      if (!runResponse.ok) {
        throw new ExternalServiceError('Instagram', `Actor başlatılamadı: HTTP ${runResponse.status}`)
      }

      const runData: ApifyInstagramRunResponse = await runResponse.json()
      const datasetId = await this.waitForCompletion(runData.data.id)

      // Rate limiting: API çağrıları arasında minimum bekleme süresi
      await this.rateLimiter.wait()

      const dataResponse = await fetch(
        `${this.baseUrl}/datasets/${datasetId}/items?token=${this.apiToken}&format=json`
      )

      if (!dataResponse.ok) {
        throw new ExternalServiceError('Instagram', `Veri alınamadı: HTTP ${dataResponse.status}`)
      }

      const profiles: InstagramProfileData[] = await dataResponse.json()

      // Aday sırasına göre dene (öncelik korunsun)
      for (const candidateUsername of candidates) {
        const profile = profiles.find(
          (p) => p.username.toLowerCase() === candidateUsername.toLowerCase()
        )
        if (!profile) continue

        const verifiable: VerifiableProfile = {
          username: profile.username,
          fullName: profile.fullName,
          biography: profile.biography,
          isBusinessAccount: profile.isBusinessAccount,
          externalUrl: profile.externalUrl,
        }

        if (verifyInstagramMatch(verifiable, businessName, context)) {
          logger.info('Instagram profil eşleşmesi bulundu', {
            username: profile.username,
            businessName,
          })
          return this.mapToRawLeadPartial(profile)
        }
      }

      return null
    } catch (error) {
      if (error instanceof ExternalServiceError) throw error
      throw new ExternalServiceError(
        'Instagram',
        error instanceof Error ? error.message : 'Bilinmeyen hata'
      )
    }
  }

  async isAvailable(): Promise<boolean> {
    return !!this.apiToken
  }

  private async waitForCompletion(runId: string, maxWaitMs: number = 120000): Promise<string> {
    const startTime = Date.now()
    const pollInterval = 3000

    while (Date.now() - startTime < maxWaitMs) {
      // Rate limiting: API çağrıları arasında minimum bekleme süresi
      await this.rateLimiter.wait()

      const response = await fetch(
        `${this.baseUrl}/actor-runs/${runId}?token=${this.apiToken}`
      )

      if (!response.ok) {
        throw new ExternalServiceError('Instagram', `Run durumu alınamadı: HTTP ${response.status}`)
      }

      const data: ApifyInstagramRunResponse = await response.json()

      if (data.data.status === 'SUCCEEDED') {
        return data.data.defaultDatasetId
      }

      if (data.data.status === 'FAILED' || data.data.status === 'ABORTED') {
        throw new ExternalServiceError('Instagram', `Actor başarısız: ${data.data.status}`)
      }

      await new Promise((resolve) => setTimeout(resolve, pollInterval))
    }

    throw new ExternalServiceError('Instagram', 'Zaman aşımı')
  }

  private mapToRawLeadPartial(profile: InstagramProfileData): Partial<RawLeadData> {
    const avgLikes = this.calculateAvgLikes(profile.latestPosts)
    const lastPostDate = this.getLastPostDate(profile.latestPosts)
    const followerCount = profile.followersCount ?? 0
    const engagementRate = followerCount > 0 && avgLikes !== undefined
      ? (avgLikes / followerCount) * 100
      : undefined
    const postingRegularity = this.calculatePostingRegularity(profile.latestPosts)
    const hasBioLink = !!profile.externalUrl

    return {
      igUsername: profile.username,
      igFollowerCount: profile.followersCount,
      igPostCount: profile.postsCount,
      igAvgLikes: avgLikes,
      igLastPostDate: lastPostDate,
      igHasHighlights: (profile.highlightReelCount ?? 0) > 0,
      igBioContainsAgency: this.detectAgencyInBio(profile.biography),
      igHasBioLink: hasBioLink,
      igEngagementRate: engagementRate,
      igPostingRegularity: postingRegularity,
    }
  }

  private calculateAvgLikes(posts?: { likesCount?: number }[]): number | undefined {
    if (!posts || posts.length === 0) return undefined
    const totalLikes = posts.reduce((sum, p) => sum + (p.likesCount ?? 0), 0)
    return Math.round(totalLikes / posts.length)
  }

  private getLastPostDate(posts?: { timestamp?: string }[]): string | undefined {
    if (!posts || posts.length === 0) return undefined
    const sorted = [...posts].sort((a, b) => {
      const dateA = a.timestamp ? new Date(a.timestamp).getTime() : 0
      const dateB = b.timestamp ? new Date(b.timestamp).getTime() : 0
      return dateB - dateA
    })
    return sorted[0]?.timestamp
  }

  private detectAgencyInBio(biography?: string): boolean {
    if (!biography) return false
    const lowerBio = biography.toLowerCase()
    return AGENCY_KEYWORDS.some((keyword) => lowerBio.includes(keyword))
  }

  /**
   * Post timestamp'larından posting regularity hesapla.
   * 60+ gün boşluk → 'gaps', 30+ gün son post → 'dead'
   */
  private calculatePostingRegularity(
    posts?: { timestamp?: string }[]
  ): 'regular' | 'irregular' | 'gaps' | 'dead' | undefined {
    if (!posts || posts.length < 2) return undefined

    const timestamps = posts
      .map((p) => p.timestamp ? new Date(p.timestamp).getTime() : 0)
      .filter((t) => t > 0)
      .sort((a, b) => b - a)

    if (timestamps.length < 2) return undefined

    // Son post 30+ gün önceyse → dead
    const now = Date.now()
    const daysSinceLastPost = (now - timestamps[0]) / (1000 * 60 * 60 * 24)
    if (daysSinceLastPost > 30) return 'dead'

    // Post aralıkları
    const gaps: number[] = []
    for (let i = 0; i < timestamps.length - 1; i++) {
      gaps.push((timestamps[i] - timestamps[i + 1]) / (1000 * 60 * 60 * 24))
    }

    const maxGap = Math.max(...gaps)
    const avgGap = gaps.reduce((s, g) => s + g, 0) / gaps.length

    // 60+ gün boşluk → gaps
    if (maxGap > 60) return 'gaps'

    // Düzensiz: ortalama aralık 14 günden fazla veya standart sapma yüksek
    if (avgGap > 14) return 'irregular'

    return 'regular'
  }
}
