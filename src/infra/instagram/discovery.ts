import { InstagramAdapter } from '@/infra/scrapers/instagram.adapter'
import {
  extractInstagramFromHtml,
  extractInstagramFromUrl,
  extractWebsiteDomain,
  guessInstagramCandidates,
} from '@/lib/instagram-utils'
import type { InstagramDiscoverySource, Lead } from '@/types/database'
import type { RawLeadData } from '@/types/lead'

export interface InstagramDiscoveryResult {
  username: string
  source: Exclude<InstagramDiscoverySource, 'MANUAL'>
  profileData: Partial<RawLeadData>
}

interface DiscoverInstagramOptions {
  websiteFetchTimeoutMs?: number
}

type DirectInstagramDiscoverySource = Extract<InstagramDiscoverySource, 'WEBSITE_URL' | 'WEBSITE_HTML'>

function isDirectDiscoverySource(
  source: InstagramDiscoverySource | null | undefined
): source is DirectInstagramDiscoverySource {
  return source === 'WEBSITE_URL' || source === 'WEBSITE_HTML'
}

export function buildInstagramSeedUpdateFromWebsite(website: string | null | undefined) {
  const username = website ? extractInstagramFromUrl(website) : null
  if (!username) {
    return null
  }

  return {
    ig_username: username,
    ig_discovery_source: 'WEBSITE_URL' as const,
  }
}

export function needsInstagramProfileBackfill(
  lead: Pick<Lead, 'ig_username' | 'ig_discovery_source' | 'ig_follower_count' | 'ig_post_count' | 'ig_last_post_date'>
) {
  return Boolean(lead.ig_username) &&
    isDirectDiscoverySource(lead.ig_discovery_source) &&
    lead.ig_follower_count === null &&
    lead.ig_post_count === null &&
    lead.ig_last_post_date === null
}

export async function discoverOrBackfillInstagramProfileForLead(
  lead: Lead,
  adapter: InstagramAdapter,
  options: DiscoverInstagramOptions = {}
): Promise<InstagramDiscoveryResult | null> {
  if (lead.ig_username && isDirectDiscoverySource(lead.ig_discovery_source)) {
    const profileData = await analyzeInstagramUsername(adapter, lead.ig_username)
    return {
      username: lead.ig_username,
      source: lead.ig_discovery_source,
      profileData,
    }
  }

  return discoverInstagramProfileForLead(lead, adapter, options)
}

export async function discoverInstagramProfileForLead(
  lead: Lead,
  adapter: InstagramAdapter,
  options: DiscoverInstagramOptions = {}
): Promise<InstagramDiscoveryResult | null> {
  if (lead.website) {
    const directUsername = extractInstagramFromUrl(lead.website)
    if (directUsername) {
      const profileData = await analyzeInstagramUsername(adapter, directUsername)
      return {
        username: directUsername,
        source: 'WEBSITE_URL',
        profileData,
      }
    }
  }

  if (lead.website && !extractInstagramFromUrl(lead.website)) {
    try {
      const url = lead.website.startsWith('http') ? lead.website : `https://${lead.website}`
      const response = await fetch(url, {
        signal: AbortSignal.timeout(options.websiteFetchTimeoutMs ?? 5000),
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; CreviaSalesBot/1.0)' },
      })

      if (response.ok) {
        const html = await response.text()
        const htmlUsername = extractInstagramFromHtml(html)

        if (htmlUsername) {
          const profileData = await analyzeInstagramUsername(adapter, htmlUsername)
          return {
            username: htmlUsername,
            source: 'WEBSITE_HTML',
            profileData,
          }
        }
      }
    } catch {
      // Website erişilemiyorsa aday doğrulamaya geç.
    }
  }

  const candidates = guessInstagramCandidates(lead)
  if (candidates.length === 0) {
    return null
  }

  const context = { websiteDomain: extractWebsiteDomain(lead.website) }
  const profileData = await adapter.findBusinessProfile(candidates, lead.business_name, context)

  if (!profileData?.igUsername) {
    return null
  }

  return {
    username: profileData.igUsername,
    source: 'CANDIDATE_VERIFIED',
    profileData,
  }
}

export function buildInstagramLeadUpdate(discovery: InstagramDiscoveryResult) {
  const profileData = discovery.profileData

  return {
    ig_username: discovery.username,
    ig_discovery_source: discovery.source,
    ...(profileData.igFollowerCount !== undefined ? { ig_follower_count: profileData.igFollowerCount ?? null } : {}),
    ...(profileData.igPostCount !== undefined ? { ig_post_count: profileData.igPostCount ?? null } : {}),
    ...(profileData.igAvgLikes !== undefined ? { ig_avg_likes: profileData.igAvgLikes ?? null } : {}),
    ...(profileData.igLastPostDate !== undefined ? { ig_last_post_date: profileData.igLastPostDate ?? null } : {}),
    ...(profileData.igHasHighlights !== undefined ? { ig_has_highlights: profileData.igHasHighlights ?? null } : {}),
    ...(profileData.igBioContainsAgency !== undefined ? { ig_bio_contains_agency: profileData.igBioContainsAgency ?? null } : {}),
    ...(profileData.igHasBioLink !== undefined ? { ig_has_bio_link: profileData.igHasBioLink ?? null } : {}),
    ...(profileData.igEngagementRate !== undefined ? { ig_engagement_rate: profileData.igEngagementRate ?? null } : {}),
    ...(profileData.igPostingRegularity !== undefined
      ? { ig_posting_regularity: profileData.igPostingRegularity ?? null }
      : {}),
  }
}

async function analyzeInstagramUsername(adapter: InstagramAdapter, username: string): Promise<Partial<RawLeadData>> {
  try {
    const profileData = await adapter.analyzeProfile(username)
    return {
      ...profileData,
      igUsername: profileData.igUsername ?? username,
    }
  } catch {
    return { igUsername: username }
  }
}
