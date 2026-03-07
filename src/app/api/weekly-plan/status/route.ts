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
      .single()

    if (planError || !plan) {
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

    // Status: SCRAPING — scrape job'ların durumunu kontrol et
    let jobIds = typedPlan.scrape_job_ids ?? []

    // scrape_job_ids boşsa weekly_plan_id ile scrape_jobs tablosundan çek (fallback)
    if (jobIds.length === 0) {
      const { data: fallbackJobs } = await supabase
        .from('scrape_jobs')
        .select('id')
        .eq('weekly_plan_id', planId)

      if (fallbackJobs && fallbackJobs.length > 0) {
        jobIds = fallbackJobs.map((j) => j.id)
        await supabase
          .from('weekly_plans')
          .update({
            scrape_job_ids: jobIds,
            total_scrape_jobs: jobIds.length,
          })
          .eq('id', planId)
      } else {
        return NextResponse.json({
          status: 'SCRAPING',
          completedJobs: 0,
          totalJobs: typedPlan.total_scrape_jobs,
          failedJobs: 0,
        })
      }
    }

    const { data: jobs } = await supabase
      .from('scrape_jobs')
      .select('id, status')
      .in('id', jobIds)

    const scrapeJobs = (jobs ?? []) as Array<Pick<ScrapeJob, 'id' | 'status'>>
    const completedCount = scrapeJobs.filter((j) => j.status === 'COMPLETED').length
    const failedCount = scrapeJobs.filter((j) => j.status === 'FAILED').length
    const finishedCount = completedCount + failedCount

    // completed_scrape_jobs güncelle
    await supabase
      .from('weekly_plans')
      .update({ completed_scrape_jobs: finishedCount })
      .eq('id', planId)

    return NextResponse.json({
      status: 'SCRAPING',
      completedJobs: finishedCount,
      totalJobs: jobIds.length,
      failedJobs: failedCount,
    })
  } catch (error) {
    logger.error('Weekly plan status hatası', { error: String(error) })
    return NextResponse.json({ error: 'Sunucu hatası' }, { status: 500 })
  }
}
