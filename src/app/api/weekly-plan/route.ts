import { NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/infra/supabase/server'
import { logger } from '@/lib/logger'
import { manualWorkflowRequiredResponse } from '@/lib/route-status'

export async function POST() {
  return manualWorkflowRequiredResponse()
}

export async function GET() {
  try {
    const supabase = createServiceRoleClient()

    const { data, error } = await supabase
      .from('weekly_plans')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    if (error && error.code !== 'PGRST116') {
      logger.error('Weekly plan getirilemedi', { error: error.message })
      return NextResponse.json({ error: 'Veriler alınamadı' }, { status: 500 })
    }

    return NextResponse.json(data ?? null)
  } catch (error) {
    logger.error('Weekly plan GET hatası', { error: String(error) })
    return NextResponse.json({ error: 'Sunucu hatası' }, { status: 500 })
  }
}

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const planId = searchParams.get('planId')

    if (!planId) {
      return NextResponse.json({ error: 'planId gerekli' }, { status: 400 })
    }

    const supabase = createServiceRoleClient()

    const { data: plan } = await supabase
      .from('weekly_plans')
      .select('id, status, week_start')
      .eq('id', planId)
      .single()

    if (!plan) {
      return NextResponse.json({ error: 'Plan bulunamadı' }, { status: 404 })
    }

    if (plan.status === 'DISTRIBUTING') {
      return NextResponse.json({ error: 'Dağıtım devam ederken plan silinemez' }, { status: 400 })
    }

    const weekStartDate = new Date(`${plan.week_start}T00:00:00`)
    const weekEndDate = new Date(weekStartDate)
    weekEndDate.setDate(weekEndDate.getDate() + 11)
    const startStr = weekStartDate.toISOString().split('T')[0]
    const endStr = weekEndDate.toISOString().split('T')[0]

    const { error: assignmentsError } = await supabase
      .from('assignments')
      .delete()
      .gte('scheduled_date', startStr)
      .lte('scheduled_date', endStr)
    const { error: routesError } = await supabase
      .from('routes')
      .delete()
      .gte('route_date', startStr)
      .lte('route_date', endStr)
    const { error: callListsError } = await supabase
      .from('call_lists')
      .delete()
      .gte('list_date', startStr)
      .lte('list_date', endStr)
    const { error: scrapeJobsError } = await supabase
      .from('scrape_jobs')
      .delete()
      .eq('weekly_plan_id', planId)
    await supabase.from('weekly_plans').delete().eq('id', planId)

    if (assignmentsError || routesError || callListsError || scrapeJobsError) {
      logger.warn('Plan sifirlama sirasinda bazi silme hatalari', {
        assignments: assignmentsError?.message,
        routes: routesError?.message,
        callLists: callListsError?.message,
        scrapeJobs: scrapeJobsError?.message,
      })
    }

    logger.info('Plan ve dagitim verileri silindi', { planId, weekStart: startStr })
    return NextResponse.json({ success: true })
  } catch (error) {
    logger.error('Weekly plan DELETE hatası', { error: String(error) })
    return NextResponse.json({ error: 'Sunucu hatası' }, { status: 500 })
  }
}
