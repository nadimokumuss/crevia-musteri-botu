import { NextRequest, NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/infra/supabase/server'
import { logger } from '@/lib/logger'
import type { WeeklyPlan, ScrapeJob } from '@/types/database'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const planId = searchParams.get('planId')

    if (!planId) {
      return NextResponse.json({ error: 'planId gerekli' }, { status: 400 })
    }

    const supabase = createServiceRoleClient()

    const { data: plan, error: planError } = await supabase
      .from('weekly_plans')
      .select('*')
      .eq('id', planId)
      .maybeSingle()

    if (planError) {
      logger.error('Weekly plan getirilemedi', { error: planError.message })
      return NextResponse.json({ error: 'Veriler alınamadı' }, { status: 500 })
    }
    if (!plan) {
      return NextResponse.json({ error: 'Plan bulunamadı' }, { status: 404 })
    }

    const typedPlan = plan as WeeklyPlan

    if (typedPlan.status === 'COMPLETED' || typedPlan.status === 'FAILED') {
      return NextResponse.json({
        status: typedPlan.status,
        completedJobs: typedPlan.completed_scrape_jobs,
        totalJobs: typedPlan.total_scrape_jobs,
        stats: typedPlan.distribution_stats,
        errorMessage: typedPlan.error_message,
      })
    }

    if (typedPlan.status === 'DISTRIBUTING') {
      return NextResponse.json({
        status: 'DISTRIBUTING',
        completedJobs: typedPlan.completed_scrape_jobs,
        totalJobs: typedPlan.total_scrape_jobs,
      })
    }

    // SCRAPING durumu — live count, persist etmeden hesapla
    const storedIds = typedPlan.scrape_job_ids ?? []

    const { data: jobs } = storedIds.length > 0
      ? await supabase.from('scrape_jobs').select('id, status').in('id', storedIds)
      : await supabase.from('scrape_jobs').select('id, status').eq('weekly_plan_id', planId)

    const scrapeJobs = (jobs ?? []) as Array<Pick<ScrapeJob, 'id' | 'status'>>
    const completedCount = scrapeJobs.filter((j) => j.status === 'COMPLETED').length
    const failedCount = scrapeJobs.filter((j) => j.status === 'FAILED').length
    const finishedCount = completedCount + failedCount
    const totalJobs = scrapeJobs.length || typedPlan.total_scrape_jobs

    return NextResponse.json({
      status: 'SCRAPING',
      completedJobs: finishedCount,
      totalJobs,
      failedJobs: failedCount,
    })
  } catch (error) {
    logger.error('Weekly plan status hatası', { error: String(error) })
    return NextResponse.json({ error: 'Sunucu hatası' }, { status: 500 })
  }
}
