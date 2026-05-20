import { NextRequest, NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/infra/supabase/server'
import { logger } from '@/lib/logger'

export const dynamic = 'force-dynamic'

/**
 * GET /api/audit/[slug] — public, no auth.
 * Sadece audit content + isletme adi/kategori/ilce doner. PII (telefon, email,
 * adres, IG handle, phone_script, outreach_email_*) hicbir kosulda donmez.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params
    if (!slug || slug.length < 3 || slug.length > 100) {
      return NextResponse.json({ error: 'Gecersiz slug' }, { status: 400 })
    }

    const supabase = createServiceRoleClient()
    const { data, error } = await supabase
      .from('leads')
      .select(
        `id,
         business_name,
         category,
         district_id,
         audit_narrative,
         audit_strengths,
         audit_gaps,
         audit_tier,
         audit_generated_at`
      )
      .eq('audit_share_slug', slug)
      .not('audit_generated_at', 'is', null)
      .maybeSingle()

    if (error) {
      logger.error('Public audit fetch hatasi', { slug, error: error.message })
      return NextResponse.json({ error: 'Audit yuklenemedi' }, { status: 500 })
    }
    if (!data) {
      return NextResponse.json({ error: 'Audit bulunamadi' }, { status: 404 })
    }

    // Ilce adini ek olarak getir (bir extra sorgu — public sayfada anlamli context)
    let districtName: string | null = null
    if (data.district_id) {
      const { data: district } = await supabase
        .from('districts')
        .select('name')
        .eq('id', data.district_id)
        .maybeSingle()
      districtName = district?.name ?? null
    }

    return NextResponse.json(
      {
        business_name: data.business_name,
        category: data.category,
        district: districtName,
        narrative: data.audit_narrative,
        strengths: data.audit_strengths,
        gaps: data.audit_gaps,
        tier: data.audit_tier,
        generated_at: data.audit_generated_at,
      },
      {
        headers: {
          'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
        },
      }
    )
  } catch (error) {
    logger.error('Public audit API hatasi', { error: String(error) })
    return NextResponse.json({ error: 'Sunucu hatasi' }, { status: 500 })
  }
}
