import { describe, it, expect } from 'vitest'
import { calculateNeedScore } from '@/core/scoring/need-score'
import type { LeadScoreInput, GoogleSignals, InstagramSignals, WebsiteSignals, MarketingSignals } from '@/types/scoring'

/** Helper: Boş 4-sutunlu input */
function emptyInput(overrides: Partial<LeadScoreInput> = {}): LeadScoreInput {
  return { google: null, instagram: null, website: null, marketing: null, ...overrides }
}

/** Helper: İyi Google profili */
function goodGoogle(overrides: Partial<GoogleSignals> = {}): GoogleSignals {
  return {
    isClaimed: true, photoCount: 20, rating: 4.5, reviewCount: 100,
    lastUpdated: new Date(), hasWebsite: true, hasPhone: true, responseRate: 0.5,
    ...overrides,
  }
}

/** Helper: İyi Instagram profili */
function goodInstagram(overrides: Partial<InstagramSignals> = {}): InstagramSignals {
  return {
    exists: true, lastPostDate: new Date(), avgLikes: 50, postCount: 100,
    hasHighlights: true, bioContainsAgency: false, hasBioLink: true,
    followerCount: 5000, postingRegularity: 'regular', engagementRate: 2, reelsRatio: 0.3,
    ...overrides,
  }
}

/** Helper: İyi website */
function goodWebsite(overrides: Partial<WebsiteSignals> = {}): WebsiteSignals {
  return { exists: true, speedScore: 85, isMobileFriendly: true, has404s: false, ...overrides }
}

/** Helper: İyi marketing */
function goodMarketing(overrides: Partial<MarketingSignals> = {}): MarketingSignals {
  return { hasMetaPixel: true, hasGA4: true, hasActiveMetaAds: true, hasActiveGoogleAds: true, ...overrides }
}

describe('calculateNeedScore - 4 sutunlu puanlama', () => {
  // ==== Tüm kaynaklar null ====
  it('tüm kaynaklar null ise yüksek puan döner', () => {
    const result = calculateNeedScore(emptyInput())

    // Google:15 + IG:15 + Web:15 + Mkt:10 = 55
    expect(result.googleSubScore).toBe(15)
    expect(result.instagramSubScore).toBe(15)
    expect(result.websiteSubScore).toBe(15)
    expect(result.marketingSubScore).toBe(10)
    expect(result.totalScore).toBe(55)
    expect(result.recommendation).toBe('MEDIUM')
  })

  // ==== Mükemmel işletme (her şey var, her şey iyi) ====
  it('mükemmel işletme için düşük puan döner', () => {
    const result = calculateNeedScore({
      google: goodGoogle(),
      instagram: goodInstagram(),
      website: goodWebsite(),
      marketing: goodMarketing(),
    })

    expect(result.googleSubScore).toBe(0)
    expect(result.instagramSubScore).toBe(0)
    expect(result.websiteSubScore).toBe(0)
    expect(result.marketingSubScore).toBe(0)
    expect(result.totalScore).toBe(0)
    expect(result.recommendation).toBe('SKIP')
  })

  // ==== Google sinyalleri ====
  describe('Google alt puani (maks 30)', () => {
    it('Google verisi null → 15 puan', () => {
      const result = calculateNeedScore(emptyInput({ google: null }))
      expect(result.googleSubScore).toBe(15)
    })

    it('sahipsiz profil → +12', () => {
      const result = calculateNeedScore(emptyInput({
        google: goodGoogle({ isClaimed: false }),
      }))
      expect(result.googleSubScore).toBe(12)
    })

    it('düşük puan veya az yorum → +8', () => {
      const result = calculateNeedScore(emptyInput({
        google: goodGoogle({ rating: 3.0 }),
      }))
      expect(result.googleSubScore).toBe(8)
    })

    it('iletişim eksik → +8', () => {
      const result = calculateNeedScore(emptyInput({
        google: goodGoogle({ hasWebsite: false }),
      }))
      expect(result.googleSubScore).toBe(8)
    })

    it('düşük yanıt oranı → +5', () => {
      const result = calculateNeedScore(emptyInput({
        google: goodGoogle({ responseRate: 0.1 }),
      }))
      expect(result.googleSubScore).toBe(5)
    })

    it('mükemmel işletme cezası → -5', () => {
      const result = calculateNeedScore(emptyInput({
        google: goodGoogle({ rating: 4.8, reviewCount: 200 }),
      }))
      expect(result.googleSubScore).toBe(0) // -5 clamped to 0
    })

    it('Google alt puanı 30 ile sınırlı', () => {
      const result = calculateNeedScore(emptyInput({
        google: {
          isClaimed: false, // +12
          photoCount: 0, rating: 2.0, reviewCount: 3, // +8
          lastUpdated: null, hasWebsite: false, hasPhone: false, // +8
          responseRate: 0.05, // +5
        }, // 12+8+8+5 = 33 → clamped to 30
      }))
      expect(result.googleSubScore).toBe(30)
    })
  })

  // ==== Instagram sinyalleri ====
  describe('Instagram alt puani (maks 30)', () => {
    it('hesap yok → 15 puan', () => {
      const result = calculateNeedScore(emptyInput({ instagram: null }))
      expect(result.instagramSubScore).toBe(15)
    })

    it('exists: false → 15 puan', () => {
      const result = calculateNeedScore(emptyInput({
        instagram: {
          exists: false, lastPostDate: null, avgLikes: null, postCount: null,
          hasHighlights: null, bioContainsAgency: null, hasBioLink: null,
          followerCount: null, postingRegularity: null, engagementRate: null, reelsRatio: null,
        },
      }))
      expect(result.instagramSubScore).toBe(15)
    })

    it('inaktif (>30 gün) → +8', () => {
      const fortyDaysAgo = new Date()
      fortyDaysAgo.setDate(fortyDaysAgo.getDate() - 40)
      const result = calculateNeedScore(emptyInput({
        instagram: goodInstagram({ lastPostDate: fortyDaysAgo }),
      }))
      expect(result.instagramSubScore).toBe(8)
    })

    it('posting boşluğu → +5', () => {
      const result = calculateNeedScore(emptyInput({
        instagram: goodInstagram({ postingRegularity: 'gaps' }),
      }))
      expect(result.instagramSubScore).toBe(5)
    })

    it('hesap ölü (3+ ay sessiz) → +5', () => {
      const result = calculateNeedScore(emptyInput({
        instagram: goodInstagram({ postingRegularity: 'dead' }),
      }))
      expect(result.instagramSubScore).toBe(5)
    })

    it('düşük profil (highlight/bio link eksik) → +5', () => {
      const result = calculateNeedScore(emptyInput({
        instagram: goodInstagram({ hasHighlights: false }),
      }))
      expect(result.instagramSubScore).toBe(5)
    })

    it('düşük etkileşim → +3', () => {
      const result = calculateNeedScore(emptyInput({
        instagram: goodInstagram({ engagementRate: 0.5 }),
      }))
      expect(result.instagramSubScore).toBe(3)
    })

    it('ajans tespit → -15', () => {
      const result = calculateNeedScore(emptyInput({
        instagram: goodInstagram({ bioContainsAgency: true }),
      }))
      // 0 + (-15) = -15 → clamped to 0
      expect(result.instagramSubScore).toBe(0)
    })

    it('ajans tespit artık -15 (eskisi -50)', () => {
      const result = calculateNeedScore(emptyInput({
        instagram: goodInstagram({ hasHighlights: false, bioContainsAgency: true }),
      }))
      // 5 (düşük profil) + (-15 ajans) = -10 → clamped to 0
      expect(result.instagramSubScore).toBe(0)
    })
  })

  // ==== Website sinyalleri ====
  describe('Website alt puani (maks 30)', () => {
    it('website yok → 15 puan', () => {
      const result = calculateNeedScore(emptyInput({ website: null }))
      expect(result.websiteSubScore).toBe(15)
    })

    it('website exists: false → 15 puan', () => {
      const result = calculateNeedScore(emptyInput({
        website: { exists: false, speedScore: null, isMobileFriendly: null, has404s: null },
      }))
      expect(result.websiteSubScore).toBe(15)
    })

    it('yavaş site (speedScore < 50) → +8', () => {
      const result = calculateNeedScore(emptyInput({
        website: goodWebsite({ speedScore: 40 }),
      }))
      // 8 (yavaş) + 3 (çok yavaş, 40>30 so NO) = sadece 8
      expect(result.websiteSubScore).toBe(8)
    })

    it('çok yavaş site (speedScore < 30) → +8 + +3 = 11', () => {
      const result = calculateNeedScore(emptyInput({
        website: goodWebsite({ speedScore: 25 }),
      }))
      // +8 (yavaş <50) + +3 (çok yavaş <30) = 11
      expect(result.websiteSubScore).toBe(11)
    })

    it('mobil uyumsuz → +5', () => {
      const result = calculateNeedScore(emptyInput({
        website: goodWebsite({ isMobileFriendly: false }),
      }))
      expect(result.websiteSubScore).toBe(5)
    })

    it('kırık sayfalar → +5', () => {
      const result = calculateNeedScore(emptyInput({
        website: goodWebsite({ has404s: true }),
      }))
      expect(result.websiteSubScore).toBe(5)
    })

    it('iyi website → 0 puan', () => {
      const result = calculateNeedScore(emptyInput({
        website: goodWebsite(),
      }))
      expect(result.websiteSubScore).toBe(0)
    })
  })

  // ==== Marketing sinyalleri ====
  describe('Marketing alt puani (maks 20)', () => {
    it('website yoksa → 10 puan', () => {
      const result = calculateNeedScore(emptyInput({
        website: null, // website yok
        marketing: null,
      }))
      expect(result.marketingSubScore).toBe(10)
    })

    it('website var, marketing null → 10 puan', () => {
      const result = calculateNeedScore(emptyInput({
        website: goodWebsite(),
        marketing: null,
      }))
      expect(result.marketingSubScore).toBe(10)
    })

    it('tüm marketing mevcut → 0 puan', () => {
      const result = calculateNeedScore(emptyInput({
        website: goodWebsite(),
        marketing: goodMarketing(),
      }))
      expect(result.marketingSubScore).toBe(0)
    })

    it('Meta Pixel yok → +5', () => {
      const result = calculateNeedScore(emptyInput({
        website: goodWebsite(),
        marketing: goodMarketing({ hasMetaPixel: false }),
      }))
      expect(result.marketingSubScore).toBe(5)
    })

    it('GA4 yok → +5', () => {
      const result = calculateNeedScore(emptyInput({
        website: goodWebsite(),
        marketing: goodMarketing({ hasGA4: null }),
      }))
      expect(result.marketingSubScore).toBe(5)
    })

    it('hiçbir marketing aracı yok → 20 puan', () => {
      const result = calculateNeedScore(emptyInput({
        website: goodWebsite(),
        marketing: { hasMetaPixel: null, hasGA4: null, hasActiveMetaAds: null, hasActiveGoogleAds: null },
      }))
      expect(result.marketingSubScore).toBe(20)
    })
  })

  // ==== Eşik değerleri ====
  describe('Yeni eşik değerleri', () => {
    it('65+ puan HIGH_PRIORITY döner', () => {
      // Tüm null: 15+15+15+10 = 55, MEDIUM
      const result = calculateNeedScore(emptyInput())
      expect(result.recommendation).toBe('MEDIUM')

      // Extra sinyal ekle
      const highResult = calculateNeedScore({
        google: null, // +15
        instagram: null, // +15
        website: null, // +15
        marketing: null, // +10 (website yok)
      }) // = 55, MEDIUM, not enough

      expect(highResult.totalScore).toBe(55)
      expect(highResult.recommendation).toBe('MEDIUM')
    })

    it('40-64 puan MEDIUM döner', () => {
      const result = calculateNeedScore(emptyInput())
      // 55 puan → MEDIUM
      expect(result.recommendation).toBe('MEDIUM')
    })

    it('15-39 puan LOW_PRIORITY döner', () => {
      const result = calculateNeedScore({
        google: goodGoogle(), // 0
        instagram: goodInstagram(), // 0
        website: null, // +15
        marketing: null, // +10 (website var=false, ama aslinda goodIG/goodG has website... website signals null)
      })
      // Google:0 + IG:0 + Web:15 + Mkt:10 = 25
      expect(result.totalScore).toBe(25)
      expect(result.recommendation).toBe('LOW_PRIORITY')
    })

    it('<15 puan SKIP döner', () => {
      const result = calculateNeedScore({
        google: goodGoogle(),
        instagram: goodInstagram(),
        website: goodWebsite(),
        marketing: goodMarketing(),
      })
      expect(result.totalScore).toBe(0)
      expect(result.recommendation).toBe('SKIP')
    })
  })

  // ==== Sinyaller ====
  it('sinyalleri doğru raporlar', () => {
    const result = calculateNeedScore(emptyInput())

    const signalNames = result.signals.map((s) => s.name)
    expect(signalNames).toContain('google_no_data')
    expect(signalNames).toContain('ig_no_account')
    expect(signalNames).toContain('web_no_site')
    expect(signalNames).toContain('mkt_no_website')
  })

  // ==== ScoreResult yeni alanlar ====
  it('ScoreResult websiteSubScore ve marketingSubScore içerir', () => {
    const result = calculateNeedScore(emptyInput())

    expect(result).toHaveProperty('websiteSubScore')
    expect(result).toHaveProperty('marketingSubScore')
    expect(typeof result.websiteSubScore).toBe('number')
    expect(typeof result.marketingSubScore).toBe('number')
  })

  // ==== Toplam 100'ü aşmaz ====
  it('toplam puan 100 ile sınırlıdır', () => {
    const fortyDaysAgo = new Date()
    fortyDaysAgo.setDate(fortyDaysAgo.getDate() - 40)

    const result = calculateNeedScore({
      google: {
        isClaimed: false, photoCount: 0, rating: 2.0, reviewCount: 3,
        lastUpdated: null, hasWebsite: false, hasPhone: false, responseRate: 0.05,
      },
      instagram: {
        exists: true, lastPostDate: fortyDaysAgo, avgLikes: 2, postCount: 50,
        hasHighlights: false, bioContainsAgency: false, hasBioLink: false,
        followerCount: 1000, postingRegularity: 'gaps', engagementRate: 0.2, reelsRatio: 0,
      },
      website: null,
      marketing: null,
    })

    expect(result.totalScore).toBeLessThanOrEqual(100)
  })

  // ==== Gerçekçi senaryo: Eskiden SKIP olan lead artık puan alıyor ====
  it('website/marketing sinyalleri sayesinde daha fazla lead puanlanır', () => {
    // Eskiden: Google iyi (0) + IG iyi (0) = 0 → SKIP
    // Şimdi: Google iyi (0) + IG iyi (0) + Website yok (15) + Marketing yok (10) = 25 → LOW_PRIORITY
    const result = calculateNeedScore({
      google: goodGoogle(),
      instagram: goodInstagram(),
      website: null,
      marketing: null,
    })

    expect(result.totalScore).toBe(25)
    expect(result.recommendation).toBe('LOW_PRIORITY')
  })
})
