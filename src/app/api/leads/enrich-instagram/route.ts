import { NextRequest, NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/infra/supabase/server'
import { InstagramAdapter } from '@/infra/scrapers/instagram.adapter'
import {
  buildInstagramLeadUpdate,
  discoverOrBackfillInstagramProfileForLead,
} from '@/infra/instagram/discovery'
import {
  countPendingInstagramLeads,
  loadPendingInstagramLeads,
} from '@/infra/instagram/pending-leads'
import { calculateNeedScore } from '@/core/scoring/need-score'
import { logger } from '@/lib/logger'
import { buildGoogleSignals, buildWebsiteSignals, buildMarketingSignals } from '@/lib/signal-builders'
import type { Lead } from '@/types/database'
import type { InstagramSignals } from '@/types/scoring'

export const maxDuration = 300 // 5 dakika timeout

/**
 * Instagram zenginleştirme endpoint'i
 *
 * 3 katmanlı strateji:
 * 1. Website URL'si doğrudan Instagram linki mi?
 * 2. Website HTML'inden Instagram linki çıkar
 * 3. Aday üretimi + Apify doğrulama
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const districtId: string | undefined = body.district_id
    const batchLimit: number = body.limit ?? 50

    const supabase = createServiceRoleClient()

    const limit = Math.min(batchLimit, 500)
    const { leads, error } = await loadPendingInstagramLeads(supabase, districtId, limit)

    if (error) {
      logger.error('Instagram zenginleştirme: lead\'ler getirilemedi', { error: error.message })
      return NextResponse.json({ error: 'Veriler alınamadı' }, { status: 500 })
    }

    if (!leads || leads.length === 0) {
      return NextResponse.json({
        message: 'Zenginleştirilecek veya yeniden denenecek lead bulunamadı',
        enriched: 0,
        processed: 0,
        unmatched: 0,
        remaining: 0,
      })
    }

    const adapter = new InstagramAdapter()
    const isAvailable = await adapter.isAvailable()

    if (!isAvailable) {
      return NextResponse.json(
        { error: 'Instagram API (Apify) yapılandırılmamış. APIFY_API_TOKEN gerekli.' },
        { status: 503 }
      )
    }

    let enriched = 0
    const sourceCounts = {
      website_url: 0,
      website_html: 0,
      candidate_verified: 0,
    }

    for (const lead of leads as Lead[]) {
      try {
        const discovery = await discoverOrBackfillInstagramProfileForLead(lead, adapter)

        // Instagram bulunamadıysa boş string ile işaretle; manuel batch yeniden deneyebilir.
        if (!discovery?.username) {
          await supabase
            .from('leads')
            .update({ ig_username: '', ig_discovery_source: null })
            .eq('id', lead.id)
          continue
        }

        // Lead'i Instagram verileriyle güncelle
        const { error: igUpdateError } = await supabase
          .from('leads')
          .update(buildInstagramLeadUpdate(discovery))
          .eq('id', lead.id)

        if (igUpdateError) {
          logger.warn('Instagram verileri güncellenemedi', { leadId: lead.id, error: igUpdateError.message })
          continue
        }

        if (discovery.source === 'WEBSITE_URL') {
          sourceCounts.website_url++
        } else if (discovery.source === 'WEBSITE_HTML') {
          sourceCounts.website_html++
        } else if (discovery.source === 'CANDIDATE_VERIFIED') {
          sourceCounts.candidate_verified++
        }

        // Puanı yeniden hesapla
        const google = buildGoogleSignals(lead)
        const profileData = {
          ...discovery.profileData,
          igUsername: discovery.username,
        }
        const instagram: InstagramSignals = {
          exists: true,
          lastPostDate: profileData.igLastPostDate ? new Date(profileData.igLastPostDate) : null,
          avgLikes: profileData.igAvgLikes ?? null,
          postCount: profileData.igPostCount ?? null,
          hasHighlights: profileData.igHasHighlights ?? null,
          bioContainsAgency: profileData.igBioContainsAgency ?? null,
          hasBioLink: profileData.igHasBioLink ?? null,
          followerCount: profileData.igFollowerCount ?? null,
          postingRegularity: profileData.igPostingRegularity ?? null,
          engagementRate: profileData.igEngagementRate ?? null,
          reelsRatio: null,
        }
        const website = buildWebsiteSignals(lead)
        const marketing = buildMarketingSignals(lead)

        const score = calculateNeedScore({ google, instagram, website, marketing })

        const { error: scoreUpdateError } = await supabase
          .from('leads')
          .update({
            need_score: score.totalScore,
            google_sub_score: score.googleSubScore,
            instagram_sub_score: score.instagramSubScore,
            website_sub_score: score.websiteSubScore,
            marketing_sub_score: score.marketingSubScore,
            recommendation: score.recommendation,
          })
          .eq('id', lead.id)

        if (scoreUpdateError) {
          logger.warn('Instagram sonrası puan güncellenemedi', { leadId: lead.id, error: scoreUpdateError.message })
        }

        enriched++
      } catch (err) {
        logger.warn('Instagram profil analizi hatası', {
          leadId: lead.id,
          error: String(err),
        })
      }
    }

    const remainingCount = await countPendingInstagramLeads(supabase, districtId)
    const processed = leads.length
    const unmatched = processed - enriched

    logger.info('Instagram zenginleştirme tamamlandı', { enriched, total: leads.length, remaining: remainingCount })

    return NextResponse.json({
      message: 'Instagram zenginleştirme tamamlandı',
      enriched,
      processed,
      unmatched,
      remaining: remainingCount,
      sources: sourceCounts,
    })
  } catch (error) {
    logger.error('Instagram enrich API hatası', { error: String(error) })
    return NextResponse.json({ error: 'Sunucu hatası' }, { status: 500 })
  }
}
