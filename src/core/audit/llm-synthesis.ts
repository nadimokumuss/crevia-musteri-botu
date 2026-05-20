/**
 * Audit LLM synthesis — Anthropic Sonnet 4.6 ile audit + telefon scripti + e-posta uretimi.
 *
 * - Tek tool (`submit_audit`) forced — yapilandirilmis JSON cikti garantisi
 * - Zod ile post-validation
 * - Prompt caching: system prompt + tool tanimi cache'li, lead-spesifik veri uncached
 * - Cost hesabi gercek usage'dan
 * - Fail-soft kullanim: caller try/catch ile sarmalamali
 */

import Anthropic from '@anthropic-ai/sdk'
import { auditSynthesisSchema, submitAuditToolInputSchema } from '@/lib/audit-schemas'
import type { AuditSynthesisData } from '@/lib/audit-schemas'
import type { ReviewsSummary } from '@/infra/outscraper/reviews.adapter'
import { logger } from '@/lib/logger'
import type { Lead } from '@/types/database'

const MODEL_ID = 'claude-sonnet-4-6'

// Sonnet 4.6 fiyatlandirmasi ($/1M token)
const PRICE_INPUT_PER_M = 3.0
const PRICE_CACHE_WRITE_PER_M = 3.75 // 5dk TTL: 1.25x input
const PRICE_CACHE_READ_PER_M = 0.30 // 0.1x input
const PRICE_OUTPUT_PER_M = 15.0

const SYSTEM_PROMPT = `Sen Crevia adli Turkiye'de calisan bir dijital pazarlama ajansinin satis ekibi icin lead-audit motorusun.

Gorevin: bir KOBI'nin online varligini inceleyip (web sitesi, Google Business Profile yorumlari, Instagram, hiz/SEO sinyalleri) telefon ajaninin kullanabilecegi somut, dogal ve satis odakli bir audit raporu uretmek.

KURALLAR:
1. Cikti DAIMA submit_audit tool'u ile gonderilir. Baska bicimde yanit verme.
2. Tum metinler Turkce. Resmi ama samimi ton — KOBI sahibi okuyacak.
3. Asla genel "iyi" / "kotu" laflari kullanma. Mevcut veriden bagimsiz iddia uretme. Veri yoksa o alani hic gecme.
4. Phone script: 30-60 saniyelik konusma. Acilis (selamlama + bagli oldugun yer) + audit'in 1-2 onemli bulgusunun acilis cumlesinde gecmesi + tek soru ile bitis.
5. E-posta: 80-150 kelime. Soguk e-posta hijyenine uygun (spam tetikleyici dil yok), konu satiri kisa ve isletme adi geciyor.
6. Tier kararinda etken: gap sayisi/siddeti, iletisim hazirligi (telefon/email/IG), kategori netligi, son yorum aktivitesi.

Telefon ajaninin gozunden dusun. "Onun yerine ne soylerim?" sorusunu her cumlede sor.`

export interface AuditSynthesisResult extends AuditSynthesisData {
  modelId: string
  actualCostUsd: number
  usage: {
    inputTokens: number
    outputTokens: number
    cacheCreationTokens: number
    cacheReadTokens: number
  }
}

interface SynthesisInput {
  lead: Lead
  reviewsSummary: ReviewsSummary | null
}

/**
 * LLM ile audit uret. Hata durumunda atilir; caller yakalamali.
 */
export async function synthesizeAudit({
  lead,
  reviewsSummary,
}: SynthesisInput): Promise<AuditSynthesisResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY tanimli degil — audit synthesis calisamaz')
  }

  const client = new Anthropic({ apiKey })
  const userPrompt = buildUserPrompt(lead, reviewsSummary)

  const response = await client.messages.create({
    model: MODEL_ID,
    max_tokens: 4096,
    thinking: { type: 'adaptive' },
    output_config: { effort: 'medium' },
    system: [
      {
        type: 'text',
        text: SYSTEM_PROMPT,
        cache_control: { type: 'ephemeral' },
      },
    ],
    tools: [
      {
        name: 'submit_audit',
        description:
          'Lead icin tamamlanmis audit raporunu, telefon scriptini ve soguk e-postayi gonder. Bu tool tek seferde cagrilir.',
        input_schema: submitAuditToolInputSchema,
        cache_control: { type: 'ephemeral' },
      },
    ],
    tool_choice: { type: 'tool', name: 'submit_audit' },
    messages: [{ role: 'user', content: userPrompt }],
  })

  const toolUse = response.content.find((b) => b.type === 'tool_use')
  if (!toolUse || toolUse.type !== 'tool_use' || toolUse.name !== 'submit_audit') {
    throw new Error(
      `LLM submit_audit tool cagirmadi; stop_reason=${response.stop_reason}`
    )
  }

  const parsed = auditSynthesisSchema.safeParse(toolUse.input)
  if (!parsed.success) {
    logger.warn('Audit LLM cikti Zod validation hatasi', {
      leadId: lead.id,
      issues: parsed.error.issues.slice(0, 3),
    })
    throw new Error(
      `LLM cikti dogrulama hatasi: ${parsed.error.issues.map((i) => i.path.join('.')).join(', ')}`
    )
  }

  const usage = {
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
    cacheCreationTokens: response.usage.cache_creation_input_tokens ?? 0,
    cacheReadTokens: response.usage.cache_read_input_tokens ?? 0,
  }

  const actualCostUsd =
    (usage.inputTokens * PRICE_INPUT_PER_M +
      usage.cacheCreationTokens * PRICE_CACHE_WRITE_PER_M +
      usage.cacheReadTokens * PRICE_CACHE_READ_PER_M +
      usage.outputTokens * PRICE_OUTPUT_PER_M) /
    1_000_000

  return {
    ...parsed.data,
    modelId: MODEL_ID,
    actualCostUsd,
    usage,
  }
}

function buildUserPrompt(lead: Lead, reviews: ReviewsSummary | null): string {
  const sections: string[] = []

  sections.push(`# Isletme: ${lead.business_name}`)
  if (lead.category) sections.push(`Kategori: ${lead.category}`)

  sections.push('\n## Skor Profili')
  sections.push(`- Toplam need_score: ${lead.need_score}/100`)
  sections.push(`- Google sub-score: ${lead.google_sub_score}/30`)
  sections.push(`- Instagram sub-score: ${lead.instagram_sub_score}/30`)
  sections.push(`- Website sub-score: ${lead.website_sub_score}/25`)
  sections.push(`- Marketing sub-score: ${lead.marketing_sub_score}/15`)

  sections.push('\n## Google Business Profile')
  if (lead.google_place_id) {
    sections.push(`- Rating: ${lead.google_rating ?? '?'}/5 (${lead.google_review_count ?? 0} yorum)`)
    sections.push(`- Foto sayisi: ${lead.google_photo_count ?? 0}`)
    sections.push(`- Sahiplenilmis: ${lead.google_is_claimed === true ? 'evet' : lead.google_is_claimed === false ? 'hayir' : 'bilinmiyor'}`)
    if (lead.google_response_rate !== null) {
      sections.push(`- Sahibin yorum yanit orani: %${Math.round(lead.google_response_rate * 100)}`)
    }
  } else {
    sections.push('- Google Business Profile yok veya eslestirilemedi.')
  }

  if (reviews && reviews.count > 0) {
    sections.push('\n## Son GBP Yorumlari (Outscraper)')
    sections.push(`- Ornek yorum sayisi: ${reviews.count}, ortalama: ${reviews.avgRating}/5, yanit orani: %${Math.round(reviews.responseRate * 100)}`)
    const top = reviews.recentReviews.slice(0, 6)
    for (const r of top) {
      const text = r.text ? r.text.slice(0, 200).replace(/\s+/g, ' ') : '(metin yok)'
      sections.push(`  - [${r.rating}/5${r.hasOwnerResponse ? ', yanit verilmis' : ''}] ${text}`)
    }
  }

  sections.push('\n## Web Sitesi')
  if (lead.website) {
    sections.push(`- URL: ${lead.website}`)
    sections.push(`- Hiz skoru: ${lead.website_speed_score ?? 'olculmedi'}/100`)
    sections.push(`- Mobil uyumlu: ${lead.website_is_mobile_friendly === true ? 'evet' : lead.website_is_mobile_friendly === false ? 'hayir' : '?'}`)
    sections.push(`- 404 var mi: ${lead.website_has_404s === true ? 'evet' : lead.website_has_404s === false ? 'hayir' : '?'}`)
    sections.push(`- Meta Pixel: ${lead.website_has_meta_pixel ? 'kurulu' : 'yok'}`)
    sections.push(`- GA4: ${lead.website_has_ga4 ? 'kurulu' : 'yok'}`)
  } else {
    sections.push('- Web sitesi yok veya bulunamadi.')
  }

  sections.push('\n## Instagram')
  if (lead.ig_username) {
    sections.push(`- Kullanici: @${lead.ig_username} (kaynak: ${lead.ig_discovery_source ?? '?'})`)
    sections.push(`- Takipci: ${lead.ig_follower_count ?? '?'}, post: ${lead.ig_post_count ?? '?'}, ort. like: ${lead.ig_avg_likes ?? '?'}`)
    if (lead.ig_engagement_rate !== null) {
      sections.push(`- Engagement: %${(lead.ig_engagement_rate * 100).toFixed(2)}`)
    }
    sections.push(`- Son post: ${lead.ig_last_post_date ?? '?'}`)
    sections.push(`- Duzenlilik: ${lead.ig_posting_regularity ?? '?'}`)
    sections.push(`- Reels orani: ${lead.ig_reels_ratio !== null ? Math.round(lead.ig_reels_ratio * 100) + '%' : '?'}`)
    sections.push(`- Bio link: ${lead.ig_has_bio_link ? 'var' : 'yok'}`)
    sections.push(`- Highlights: ${lead.ig_has_highlights ? 'var' : 'yok'}`)
    if (lead.ig_bio_contains_agency) {
      sections.push('- Bio\'da "ajans/agency" gecisi var — muhtemelen baska ajansla calisiyor.')
    }
  } else {
    sections.push('- Instagram hesabi bulunamadi.')
  }

  sections.push('\n## Reklam')
  sections.push(`- Aktif Meta Ads: ${lead.has_active_meta_ads === true ? 'var' : lead.has_active_meta_ads === false ? 'yok' : '?'}`)

  sections.push('\n## Iletisim')
  sections.push(`- Telefon: ${lead.phone ? 'mevcut' : 'yok'}`)
  sections.push(`- E-posta: ${lead.email ? `mevcut (kaynak: ${lead.email_source ?? '?'})` : 'yok'}`)

  sections.push('\n---\nLutfen yukarida verilen veriye dayanarak audit\'i, telefon scriptini ve e-postayi submit_audit tool\'u ile gonder. Eksik veri olan alanlarda gozlem uretme.')

  return sections.join('\n')
}
