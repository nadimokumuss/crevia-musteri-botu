/**
 * Need Score algoritması - Potansiyel müşteri ihtiyaç puanlaması (0-100)
 *
 * 4-sutunlu puanlama:
 * Google Alt Puanı (0-30) + Instagram Alt Puanı (0-30) + Website Alt Puanı (0-30) + Marketing Alt Puanı (0-20)
 */

import type {
  LeadScoreInput,
  ScoreResult,
  ScoreSignal,
  GoogleSignals,
  InstagramSignals,
  WebsiteSignals,
  MarketingSignals,
} from '@/types/scoring'
import type { LeadRecommendation } from '@/types/database'
import { SCORE_THRESHOLDS } from '@/lib/constants'

function scoreGoogle(google: GoogleSignals | null): { score: number; signals: ScoreSignal[] } {
  const signals: ScoreSignal[] = []

  if (google === null) {
    signals.push({ name: 'google_no_data', points: 15, reason: 'Google verisi yok' })
    return { score: 15, signals }
  }

  let score = 0

  // Sahiplenilmemiş profil
  if (google.isClaimed === false) {
    const points = 12
    score += points
    signals.push({ name: 'google_unclaimed', points, reason: 'Profil sahiplenilmemiş' })
  }

  // Düşük puan VEYA az yorum
  if (
    (google.rating !== null && google.rating < 3.5) ||
    (google.reviewCount !== null && google.reviewCount < 10)
  ) {
    const points = 8
    score += points
    signals.push({ name: 'google_low_rating_or_reviews', points, reason: 'Düşük puan (<3.5) veya az yorum (<10)' })
  }

  // İletişim eksik (website veya telefon yok)
  if (google.hasWebsite === false || google.hasPhone === false) {
    const points = 8
    score += points
    signals.push({ name: 'google_missing_contact', points, reason: 'Website veya telefon eksik' })
  }

  // Yorumlara cevap yok
  if (google.responseRate !== null && google.responseRate < 0.2) {
    const points = 5
    score += points
    signals.push({ name: 'google_low_response_rate', points, reason: 'Yorum yanıt oranı düşük (<%20)' })
  }

  // Mükemmel işletme cezası
  if (
    google.rating !== null && google.rating > 4.5 &&
    google.reviewCount !== null && google.reviewCount > 100
  ) {
    const points = -5
    score += points
    signals.push({ name: 'google_excellent', points, reason: 'Mükemmel işletme (>4.5 puan, >100 yorum)' })
  }

  return { score: Math.min(Math.max(score, 0), 30), signals }
}

function scoreInstagram(instagram: InstagramSignals | null): { score: number; signals: ScoreSignal[] } {
  const signals: ScoreSignal[] = []

  if (instagram === null || !instagram.exists) {
    signals.push({ name: 'ig_no_account', points: 15, reason: 'Instagram hesabı yok' })
    return { score: 15, signals }
  }

  let score = 0

  // İnaktif (30 günden fazla gönderi yok)
  if (instagram.lastPostDate !== null) {
    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
    if (instagram.lastPostDate < thirtyDaysAgo) {
      const points = 8
      score += points
      signals.push({ name: 'ig_inactive', points, reason: 'İnaktif (>30 gün gönderi yok)' })
    }
  }

  // Posting boşluğu
  if (instagram.postingRegularity === 'gaps') {
    const points = 5
    score += points
    signals.push({ name: 'ig_posting_gaps', points, reason: 'Gönderi düzensizliği (boşluklar)' })
  }

  // Tamamen ölü hesap (3+ ay sessiz) — gaps üzerine ek ceza
  if (instagram.postingRegularity === 'dead') {
    const points = 5
    score += points
    signals.push({ name: 'ig_dead', points, reason: 'Hesap tamamen ölü (3+ ay)' })
  }

  // Profil kalitesi düşük (highlight yok veya bio link yok)
  if (instagram.hasHighlights === false || instagram.hasBioLink === false) {
    const points = 5
    score += points
    signals.push({ name: 'ig_low_profile_quality', points, reason: 'Düşük profil (highlight veya bio link eksik)' })
  }

  // Düşük etkileşim
  if (instagram.engagementRate !== null && instagram.engagementRate < 1) {
    const points = 3
    score += points
    signals.push({ name: 'ig_low_engagement', points, reason: 'Düşük etkileşim oranı (<%1)' })
  }

  // Ajans tespit (negatif sinyal - zaten ajansla çalışıyor)
  if (instagram.bioContainsAgency === true) {
    const points = -15
    score += points
    signals.push({ name: 'ig_has_agency', points, reason: 'Ajans tespit edildi (bio)' })
  }

  return { score: Math.max(0, Math.min(score, 30)), signals }
}

function scoreWebsite(website: WebsiteSignals | null): { score: number; signals: ScoreSignal[] } {
  const signals: ScoreSignal[] = []

  if (website === null || !website.exists) {
    signals.push({ name: 'web_no_site', points: 15, reason: 'Website yok' })
    return { score: 15, signals }
  }

  let score = 0

  // Yavaş site
  if (website.speedScore !== null && website.speedScore < 50) {
    const points = 8
    score += points
    signals.push({ name: 'web_slow', points, reason: 'Yavaş site (hız skoru <50)' })
  }

  // Mobil uyumsuz
  if (website.isMobileFriendly === false) {
    const points = 5
    score += points
    signals.push({ name: 'web_not_mobile_friendly', points, reason: 'Mobil uyumsuz' })
  }

  // Kırık sayfalar
  if (website.has404s === true) {
    const points = 5
    score += points
    signals.push({ name: 'web_has_404s', points, reason: 'Kırık sayfalar (404)' })
  }

  // Çok yavaş
  if (website.speedScore !== null && website.speedScore < 30) {
    const points = 3
    score += points
    signals.push({ name: 'web_very_slow', points, reason: 'Çok yavaş site (hız skoru <30)' })
  }

  return { score: Math.min(Math.max(score, 0), 30), signals }
}

function scoreMarketing(marketing: MarketingSignals | null, hasWebsite: boolean): { score: number; signals: ScoreSignal[] } {
  const signals: ScoreSignal[] = []

  // Website yoksa tüm marketing sinyalleri 10 puan
  if (!hasWebsite) {
    signals.push({ name: 'mkt_no_website', points: 10, reason: 'Website yok, marketing altyapısı yok' })
    return { score: 10, signals }
  }

  if (marketing === null) {
    signals.push({ name: 'mkt_no_data', points: 10, reason: 'Marketing verisi yok' })
    return { score: 10, signals }
  }

  let score = 0

  // Meta Pixel yok
  if (marketing.hasMetaPixel === false || marketing.hasMetaPixel === null) {
    const points = 5
    score += points
    signals.push({ name: 'mkt_no_pixel', points, reason: 'Meta Pixel yok' })
  }

  // GA4 yok
  if (marketing.hasGA4 === false || marketing.hasGA4 === null) {
    const points = 5
    score += points
    signals.push({ name: 'mkt_no_ga4', points, reason: 'GA4 yok' })
  }

  // Meta reklam yok
  if (marketing.hasActiveMetaAds === false || marketing.hasActiveMetaAds === null) {
    const points = 5
    score += points
    signals.push({ name: 'mkt_no_meta_ads', points, reason: 'Meta reklam yok' })
  }

  // Google reklam yok
  if (marketing.hasActiveGoogleAds === false || marketing.hasActiveGoogleAds === null) {
    const points = 5
    score += points
    signals.push({ name: 'mkt_no_google_ads', points, reason: 'Google reklam yok' })
  }

  return { score: Math.min(Math.max(score, 0), 20), signals }
}

function getRecommendation(totalScore: number): LeadRecommendation {
  if (totalScore >= SCORE_THRESHOLDS.HIGH_PRIORITY) return 'HIGH_PRIORITY'
  if (totalScore >= SCORE_THRESHOLDS.MEDIUM) return 'MEDIUM'
  if (totalScore >= SCORE_THRESHOLDS.LOW_PRIORITY) return 'LOW_PRIORITY'
  return 'SKIP'
}

export function calculateNeedScore(input: LeadScoreInput): ScoreResult {
  const google = scoreGoogle(input.google)
  const instagram = scoreInstagram(input.instagram)
  const website = scoreWebsite(input.website)

  const hasWebsite = input.website !== null && input.website.exists
  const marketing = scoreMarketing(input.marketing, hasWebsite)

  const totalScore = Math.min(
    google.score + instagram.score + website.score + marketing.score,
    100
  )

  return {
    totalScore,
    googleSubScore: google.score,
    instagramSubScore: instagram.score,
    websiteSubScore: website.score,
    marketingSubScore: marketing.score,
    recommendation: getRecommendation(totalScore),
    signals: [...google.signals, ...instagram.signals, ...website.signals, ...marketing.signals],
  }
}
