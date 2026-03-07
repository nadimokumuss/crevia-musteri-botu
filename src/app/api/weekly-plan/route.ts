import { NextRequest, NextResponse } from 'next/server'
import { createWeeklyPlanSchema } from '@/lib/validators'
import { createServiceRoleClient } from '@/infra/supabase/server'
import { logger } from '@/lib/logger'
import { getNextWeekPlan } from '@/core/scheduler/weekly-planner'
import { DAILY_CALL_TARGET, MAX_DAILY_VISITS, CATEGORIES } from '@/lib/constants'
import type { WeeklyPlanStatus, AgentPreferences, Agent } from '@/types/database'

export async function POST(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const isScanMode = searchParams.get('mode') === 'scan'

    const body = await request.json()

    const supabase = createServiceRoleClient()

    let weekStart: string | undefined

    // scan modunda weekly_plans kontrolü ve kaydı atlanır
    if (!isScanMode) {
      const parsed = createWeeklyPlanSchema.parse(body)

      // Sonraki haftanın Pazartesi tarihini hesapla
      if (parsed.week_start) {
        weekStart = parsed.week_start
      } else {
        const plan = getNextWeekPlan()
        if (plan.length === 0) {
          return NextResponse.json({ error: 'Hafta planı oluşturulamadı' }, { status: 400 })
        }
        weekStart = plan[0].date.toISOString().split('T')[0]
      }

      // Aynı hafta için mevcut plan var mı?
      const { data: existing } = await supabase
        .from('weekly_plans')
        .select('id, status, created_at')
        .eq('week_start', weekStart)
        .single()

      if (existing) {
        const isStuck =
          existing.status === 'SCRAPING' &&
          Date.now() - new Date(existing.created_at).getTime() > 10 * 60 * 1000

        if (isStuck) {
          logger.warn('Stuck plan siliniyor', { planId: existing.id, status: existing.status })
          await supabase.from('weekly_plans').delete().eq('id', existing.id)
        } else {
          return NextResponse.json(
            { error: `Bu hafta için zaten bir plan mevcut (durum: ${existing.status})`, planId: existing.id },
            { status: 409 }
          )
        }
      }
    }

    // Tüm aktif ajanların tercihlerini çek
    const { data: agents } = await supabase
      .from('agents')
      .select('*')
      .eq('is_active', true)
      .neq('role', 'ADMIN')

    if (!agents || agents.length === 0) {
      return NextResponse.json({ error: 'Aktif ajan bulunamadı' }, { status: 400 })
    }

    const { data: allPrefs } = await supabase
      .from('agent_preferences')
      .select('*')

    const prefsMap = new Map<string, AgentPreferences>()
    if (allPrefs) {
      for (const p of allPrefs) {
        prefsMap.set(p.agent_id, p as AgentPreferences)
      }
    }

    // Tercihsiz ajanları logla
    const agentsWithoutPrefs = (agents as Agent[]).filter(
      (a) => !prefsMap.has(a.id) || (prefsMap.get(a.id)!.district_ids.length === 0)
    )
    if (agentsWithoutPrefs.length > 0) {
      logger.warn('Tercihsiz ajanlar atlanıyor', {
        agents: agentsWithoutPrefs.map((a) => a.full_name),
      })
    }

    // Toplam lead ihtiyacını hesapla
    const typedAgents = agents as Agent[]
    const fieldAgentCount = typedAgents.filter((a) => a.role === 'FIELD_AGENT').length
    const telesalesAgentCount = typedAgents.filter((a) => a.role === 'TELESALES_AGENT').length
    // FIELD: 5 saha günü × 10 = 50 lead/ajan (sadece ziyaret, arama yok)
    // TELESALES: 5 arama günü × 20 = 100 lead/ajan
    const totalLeadNeed = fieldAgentCount * (5 * MAX_DAILY_VISITS)
      + telesalesAgentCount * (5 * DAILY_CALL_TARGET)

    // Benzersiz (district_id, category) kombinasyonlarını belirle
    const combos = new Set<string>()
    const scrapeConfigs: Array<{ districtId: string; category: string; limit: number }> = []
    const allDistrictIds = new Set<string>()

    for (const [, prefs] of prefsMap) {
      if (prefs.district_ids.length === 0) continue
      for (const districtId of prefs.district_ids) {
        allDistrictIds.add(districtId)
        if (prefs.categories.length === 0) {
          const key = `${districtId}:`
          if (!combos.has(key)) {
            combos.add(key)
            scrapeConfigs.push({ districtId, category: '', limit: 0 })
          }
        } else {
          for (const category of prefs.categories) {
            const key = `${districtId}:${category}`
            if (!combos.has(key)) {
              combos.add(key)
              scrapeConfigs.push({ districtId, category, limit: 0 })
            }
          }
        }
      }
    }

    // Her ilçe için genel tarama ekle (kategori-spesifik sonuçları tamamlar)
    for (const districtId of allDistrictIds) {
      const key = `${districtId}:`
      if (!combos.has(key)) {
        combos.add(key)
        scrapeConfigs.push({ districtId, category: '', limit: 0 })
      }
    }

    // İhtiyaç karşılanmıyorsa her ilçe için ek kategori taramaları ekle
    const maxPerJob = 60
    const currentCapacity = scrapeConfigs.length * maxPerJob
    if (currentCapacity < totalLeadNeed * 1.5) {
      for (const districtId of allDistrictIds) {
        for (const category of CATEGORIES) {
          const key = `${districtId}:${category}`
          if (!combos.has(key)) {
            combos.add(key)
            scrapeConfigs.push({ districtId, category, limit: 0 })
          }
        }
      }
    }

    if (scrapeConfigs.length === 0) {
      return NextResponse.json({ error: 'Taranacak ilçe/kategori kombinasyonu bulunamadı' }, { status: 400 })
    }

    // Her scrape job'a eşit limit dağıt (min 20, max 60 — Vercel 60s timeout'una sığmalı)
    const perJobLimit = Math.min(maxPerJob, Math.max(20, Math.ceil((totalLeadNeed * 1.5) / scrapeConfigs.length)))
    for (const config of scrapeConfigs) {
      config.limit = perJobLimit
    }

    // scan modunda weekly_plans'a kayıt yazmadan sadece config dön
    if (isScanMode) {
      logger.info('Tarama konfigürasyonu oluşturuldu (scan mode)', {
        totalConfigs: scrapeConfigs.length,
        skippedAgents: agentsWithoutPrefs.map((a) => a.full_name),
      })

      return NextResponse.json({
        totalJobs: scrapeConfigs.length,
        scrapeConfigs,
        skippedAgents: agentsWithoutPrefs.map((a) => a.full_name),
      })
    }

    // weekly_plans kaydı oluştur
    const { data: plan, error: planError } = await supabase
      .from('weekly_plans')
      .insert({
        week_start: weekStart!,
        status: 'SCRAPING' as WeeklyPlanStatus,
        scrape_job_ids: [],
        total_scrape_jobs: scrapeConfigs.length,
        completed_scrape_jobs: 0,
      })
      .select()
      .single()

    if (planError || !plan) {
      logger.error('Weekly plan oluşturulamadı', { error: planError?.message })
      return NextResponse.json({ error: 'Plan oluşturulamadı' }, { status: 500 })
    }

    logger.info('Haftalık plan oluşturuldu (client-driven)', {
      planId: plan.id,
      weekStart: weekStart!,
      totalConfigs: scrapeConfigs.length,
      skippedAgents: agentsWithoutPrefs.map((a) => a.full_name),
    })

    return NextResponse.json({
      planId: plan.id,
      status: 'SCRAPING',
      totalJobs: scrapeConfigs.length,
      weekStart,
      scrapeConfigs,
      skippedAgents: agentsWithoutPrefs.map((a) => a.full_name),
    }, { status: 201 })
  } catch (error) {
    logger.error('Weekly plan POST hatası', { error: String(error) })
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Geçersiz istek' },
      { status: 400 }
    )
  }
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

export async function DELETE(request: NextRequest) {
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

    // DISTRIBUTING durumdaki plan silinmemeli (aktif işlem var)
    if (plan.status === 'DISTRIBUTING') {
      return NextResponse.json({ error: 'Dağıtım devam ederken plan silinemez' }, { status: 400 })
    }

    // Haftanın tarih aralığını hesapla — hem doğru hem eski hatalı haftayı temizle
    const weekStartDate = new Date(plan.week_start + 'T00:00:00')
    const weekEndDate = new Date(weekStartDate)
    weekEndDate.setDate(weekEndDate.getDate() + 11) // +11 gün = 2 hafta kapsasın (eski hatalı verileri de temizler)
    const startStr = weekStartDate.toISOString().split('T')[0]
    const endStr = weekEndDate.toISOString().split('T')[0]

    // Dağıtım verilerini temizle
    const { error: e1 } = await supabase.from('assignments').delete().gte('scheduled_date', startStr).lte('scheduled_date', endStr)
    const { error: e2 } = await supabase.from('routes').delete().gte('route_date', startStr).lte('route_date', endStr)
    const { error: e3 } = await supabase.from('call_lists').delete().gte('list_date', startStr).lte('list_date', endStr)
    const { error: e4 } = await supabase.from('scrape_jobs').delete().eq('weekly_plan_id', planId)
    await supabase.from('weekly_plans').delete().eq('id', planId)

    if (e1 || e2 || e3 || e4) {
      logger.warn('Sıfırlama sırasında bazı silme hataları', {
        assignments: e1?.message, routes: e2?.message, callLists: e3?.message, scrapeJobs: e4?.message,
      })
    }

    logger.info('Plan ve dağıtım verileri silindi (reset)', { planId, status: plan.status, weekStart: startStr })

    return NextResponse.json({ success: true })
  } catch (error) {
    logger.error('Weekly plan DELETE hatası', { error: String(error) })
    return NextResponse.json({ error: 'Sunucu hatası' }, { status: 500 })
  }
}
