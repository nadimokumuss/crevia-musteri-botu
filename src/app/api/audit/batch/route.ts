import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient, createServiceRoleClient } from '@/infra/supabase/server'
import { runAuditPipeline } from '@/core/audit/audit-pipeline'
import { logger } from '@/lib/logger'
import { auditBatchSchema } from '@/lib/validators'

export const maxDuration = 300

/**
 * POST /api/audit/batch — admin-only audit batch tetik.
 * HIGH/MEDIUM filter (default minScore=40) ile uygun lead'leri toplu isler.
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Yetkisiz erisim' }, { status: 401 })
    }

    const serviceClient = createServiceRoleClient()
    const { data: callerAgent } = await serviceClient
      .from('agents')
      .select('id, role, is_active')
      .eq('user_id', user.id)
      .maybeSingle()

    if (!callerAgent || !callerAgent.is_active || callerAgent.role !== 'ADMIN') {
      return NextResponse.json(
        { error: 'Bu islem icin yonetici yetkisi gerekli' },
        { status: 403 }
      )
    }

    const body = await request.json().catch(() => ({}))
    const parsed = auditBatchSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Gecersiz istek govdesi' }, { status: 400 })
    }

    const result = await runAuditPipeline(parsed.data)

    logger.info('Audit batch tamamlandi', {
      eligible: result.eligible,
      synthesized: result.synthesized,
      skipped: result.skipped,
      errors: result.errors.length,
      costUsd: result.estimatedCostUsd.total,
    })

    return NextResponse.json(result)
  } catch (error) {
    logger.error('Audit batch API hatasi', { error: String(error) })
    return NextResponse.json({ error: 'Sunucu hatasi' }, { status: 500 })
  }
}
