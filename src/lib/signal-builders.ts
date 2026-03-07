/**
 * Lead verilerinden puanlama sinyalleri oluşturan utility fonksiyonlar
 *
 * Bu modül, Lead entity'sinden GoogleSignals, InstagramSignals,
 * WebsiteSignals ve MarketingSignals oluşturur.
 */

import type { Lead } from '@/types/database'
import type { GoogleSignals, InstagramSignals, WebsiteSignals, MarketingSignals } from '@/types/scoring'

/**
 * Lead'den Google sinyallerini çıkar
 */
export function buildGoogleSignals(lead: Lead): GoogleSignals | null {
  if (!lead.google_place_id && lead.google_rating === null && lead.google_review_count === null) {
    return null
  }

  return {
    isClaimed: lead.google_is_claimed,
    photoCount: lead.google_photo_count,
    rating: lead.google_rating,
    reviewCount: lead.google_review_count,
    lastUpdated: lead.google_last_updated ? new Date(lead.google_last_updated) : null,
    hasWebsite: !!lead.website,
    hasPhone: !!lead.phone,
    responseRate: lead.google_response_rate,
  }
}

/**
 * Lead'den Instagram sinyallerini çıkar
 */
export function buildInstagramSignals(lead: Lead): InstagramSignals | null {
  if (!lead.ig_username) {
    return null
  }

  return {
    exists: true,
    lastPostDate: lead.ig_last_post_date ? new Date(lead.ig_last_post_date) : null,
    avgLikes: lead.ig_avg_likes,
    postCount: lead.ig_post_count,
    hasHighlights: lead.ig_has_highlights,
    bioContainsAgency: lead.ig_bio_contains_agency,
    hasBioLink: lead.ig_has_bio_link,
    followerCount: lead.ig_follower_count,
    postingRegularity: lead.ig_posting_regularity,
    engagementRate: lead.ig_engagement_rate,
    reelsRatio: lead.ig_reels_ratio,
  }
}

/**
 * Lead'den Website sinyallerini çıkar
 */
export function buildWebsiteSignals(lead: Lead): WebsiteSignals | null {
  return {
    exists: !!lead.website,
    speedScore: lead.website_speed_score,
    isMobileFriendly: lead.website_is_mobile_friendly,
    has404s: lead.website_has_404s,
  }
}

/**
 * Lead'den Marketing sinyallerini çıkar
 */
export function buildMarketingSignals(lead: Lead): MarketingSignals | null {
  return {
    hasMetaPixel: lead.website_has_meta_pixel,
    hasGA4: lead.website_has_ga4,
    hasActiveMetaAds: lead.has_active_meta_ads,
    hasActiveGoogleAds: null, // Ertelendi
  }
}

/**
 * Lead'den tüm sinyalleri çıkar (kolay kullanım için)
 */
export function buildAllSignals(lead: Lead) {
  return {
    google: buildGoogleSignals(lead),
    instagram: buildInstagramSignals(lead),
    website: buildWebsiteSignals(lead),
    marketing: buildMarketingSignals(lead),
  }
}
