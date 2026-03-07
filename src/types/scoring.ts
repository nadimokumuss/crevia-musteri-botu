/**
 * Need Score algoritması tip tanımları
 * 4-sutunlu puanlama: Google(0-30) + Instagram(0-30) + Website(0-30) + Marketing(0-20)
 */

import type { LeadRecommendation } from './database'

export interface GoogleSignals {
  isClaimed: boolean | null
  photoCount: number | null
  rating: number | null
  reviewCount: number | null
  lastUpdated: Date | null
  hasWebsite: boolean | null
  hasPhone: boolean | null
  responseRate: number | null
}

export interface InstagramSignals {
  exists: boolean
  lastPostDate: Date | null
  avgLikes: number | null
  postCount: number | null
  hasHighlights: boolean | null
  bioContainsAgency: boolean | null
  hasBioLink: boolean | null
  followerCount: number | null
  postingRegularity: 'regular' | 'irregular' | 'gaps' | 'dead' | null
  engagementRate: number | null
  reelsRatio: number | null
}

export interface WebsiteSignals {
  exists: boolean
  speedScore: number | null
  isMobileFriendly: boolean | null
  has404s: boolean | null
}

export interface MarketingSignals {
  hasMetaPixel: boolean | null
  hasGA4: boolean | null
  hasActiveMetaAds: boolean | null
  hasActiveGoogleAds: boolean | null
}

export interface LeadScoreInput {
  google: GoogleSignals | null
  instagram: InstagramSignals | null
  website: WebsiteSignals | null
  marketing: MarketingSignals | null
}

export interface ScoreSignal {
  name: string
  points: number
  reason: string
}

export interface ScoreResult {
  totalScore: number
  googleSubScore: number
  instagramSubScore: number
  websiteSubScore: number
  marketingSubScore: number
  recommendation: LeadRecommendation
  signals: ScoreSignal[]
}
