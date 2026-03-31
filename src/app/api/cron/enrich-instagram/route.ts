import { NextRequest, NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/infra/supabase/server'
import { InstagramAdapter } from '@/infra/scrapers/instagram.adapter'
import {
  buildInstagramLeadUpdate,
  discoverOrBackfillInstagramProfileForLead,
} from '@/infra/instagram/discovery'
import {
  countPendingInstagramLeads,
  loadNextPendingInstagramLead,
} from '@/infra/instagram/pending-leads'
import { calculateNeedScore } from '@/core/scoring/need-score'
import { logger } from '@/lib/logger'
import { buildGoogleSignals, buildWebsiteSignals, buildMarketingSignals } from '@/lib/signal-builders'
import type { Lead } from '@/types/database'
import type { InstagramSignals } from '@/types/scoring'

/**
 * Cron job: Her dakika 1 lead zenginleştir
 * Vercel Hobby plan 10 saniye limit - tek lead güvenli
 */
export async function GET(request: NextRequest) {
  // Cron secret kontrolü (opsiyonel güvenlik)
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const supabase = createServiceRoleClient()

    const { lead, error } = await loadNextPendingInstagramLead(supabase)

    if (error) {
      logger.error('Cron: lead getirilemedi', { error: error.message })
      return NextResponse.json({ error: 'DB error' }, { status: 500 })
    }

    if (!lead) {
      return NextResponse.json({ message: 'İşlenecek Instagram kaydı yok', enriched: 0 })
    }

    const adapter = new InstagramAdapter()
    const isAvailable = await adapter.isAvailable()

    if (!isAvailable) {
      return NextResponse.json({ error: 'Apify not configured' }, { status: 503 })
    }

    let enriched = 0

    try {
      const discovery = await discoverOrBackfillInstagramProfileForLead(lead as Lead, adapter, {
        websiteFetchTimeoutMs: 3000,
      })

      if (!discovery?.username) {
        await supabase
          .from('leads')
          .update({ ig_username: '', ig_discovery_source: null })
          .eq('id', lead.id)
      } else {
        await supabase
          .from('leads')
          .update(buildInstagramLeadUpdate(discovery))
          .eq('id', lead.id)

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

        await supabase
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

        enriched = 1
      }
    } catch (err) {
      logger.warn('Cron: Instagram analiz hatası', { leadId: lead.id, error: String(err) })
      // Hata olsa bile işaretle - sonsuz döngü önle
      await supabase
        .from('leads')
        .update({ ig_username: '', ig_discovery_source: null })
        .eq('id', lead.id)
    }

    const remaining = await countPendingInstagramLeads(supabase, undefined)

    logger.info('Cron: Instagram zenginleştirme', { enriched, remaining })

    return NextResponse.json({ enriched, remaining })
  } catch (error) {
    logger.error('Cron: Genel hata', { error: String(error) })
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
