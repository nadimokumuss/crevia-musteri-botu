import { NextRequest, NextResponse } from 'next/server'
import { createLeadSchema, paginationSchema } from '@/lib/validators'
import { createServiceRoleClient } from '@/infra/supabase/server'
import { logLeadActivity } from '@/infra/supabase/log-activity'
import { logger } from '@/lib/logger'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const pagination = paginationSchema.parse({
      page: searchParams.get('page') ?? undefined,
      limit: searchParams.get('limit') ?? undefined,
      sort_by: searchParams.get('sort_by') ?? undefined,
      sort_order: searchParams.get('sort_order') ?? undefined,
    })

    const supabase = createServiceRoleClient()

    const from = (pagination.page - 1) * pagination.limit
    const to = from + pagination.limit - 1

    let query = supabase
      .from('leads')
      .select('*', { count: 'exact' })

    // Filtreler
    const status = searchParams.get('status')
    if (status) {
      query = query.eq('status', status)
    }

    const recommendation = searchParams.get('recommendation')
    if (recommendation) {
      query = query.eq('recommendation', recommendation)
    }

    const category = searchParams.get('category')
    if (category) {
      query = query.eq('category', category)
    }

    const districtId = searchParams.get('district_id')
    if (districtId) {
      query = query.eq('district_id', districtId)
    }

    const search = searchParams.get('search')
    if (search) {
      query = query.ilike('business_name', `%${search}%`)
    }

    // lead_ids filtresi (birden fazla ID ile sorgulama)
    const leadIds = searchParams.get('lead_ids')
    if (leadIds) {
      const ids = leadIds.split(',').filter(Boolean)
      if (ids.length > 0) {
        query = query.in('id', ids)
      }
    }

    // recent_days filtresi (son N gün)
    const recentDays = searchParams.get('recent_days')
    if (recentDays) {
      const days = parseInt(recentDays, 10)
      if (!isNaN(days) && days > 0) {
        const since = new Date()
        since.setDate(since.getDate() - days)
        query = query.gte('created_at', since.toISOString())
      }
    }

    // assignment_status + assignment_type filtresi (ziyaret edilenler vb.)
    const assignmentStatus = searchParams.get('assignment_status')
    const assignmentType = searchParams.get('assignment_type')
    if (assignmentStatus) {
      let assignmentQuery = supabase
        .from('assignments')
        .select('lead_id')
        .eq('status', assignmentStatus)
      if (assignmentType) {
        assignmentQuery = assignmentQuery.eq('type', assignmentType)
      }
      const { data: assignments } = await assignmentQuery
      const assignedLeadIds = (assignments ?? []).map((a) => a.lead_id).filter(Boolean)
      if (assignedLeadIds.length === 0) {
        // Sonuç yok — boş dön
        return NextResponse.json({
          data: [],
          pagination: { page: pagination.page, limit: pagination.limit, total: 0, totalPages: 0 },
        })
      }
      query = query.in('id', assignedLeadIds)
    }

    // call_status filtresi (CALLBACK olan lead'ler)
    const callStatus = searchParams.get('call_status')
    if (callStatus) {
      const { data: callLists } = await supabase
        .from('call_lists')
        .select('items')
      const callbackLeadIds: string[] = []
      for (const cl of callLists ?? []) {
        const items = cl.items as Array<{ leadId?: string; status?: string }> | null
        if (!items) continue
        for (const item of items) {
          if (item.status === callStatus && item.leadId) {
            callbackLeadIds.push(item.leadId)
          }
        }
      }
      const uniqueCallbackIds = [...new Set(callbackLeadIds)]
      if (uniqueCallbackIds.length === 0) {
        return NextResponse.json({
          data: [],
          pagination: { page: pagination.page, limit: pagination.limit, total: 0, totalPages: 0 },
        })
      }
      query = query.in('id', uniqueCallbackIds)
    }

    // Sıralama
    const sortBy = pagination.sort_by ?? 'need_score'
    query = query
      .order(sortBy, { ascending: pagination.sort_order === 'asc' })
      .range(from, to)

    const { data, error, count } = await query

    if (error) {
      logger.error('Leads getirilemedi', { error: error.message })
      return NextResponse.json({ error: 'Veriler alınamadı' }, { status: 500 })
    }

    return NextResponse.json({
      data,
      pagination: {
        page: pagination.page,
        limit: pagination.limit,
        total: count ?? 0,
        totalPages: Math.ceil((count ?? 0) / pagination.limit),
      },
    })
  } catch (error) {
    logger.error('Leads API hatası', { error: String(error) })
    return NextResponse.json({ error: 'Sunucu hatası' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const parsed = createLeadSchema.parse(body)

    const supabase = createServiceRoleClient()

    const { data, error } = await supabase
      .from('leads')
      .insert(parsed)
      .select()
      .single()

    if (error) {
      logger.error('Lead oluşturulamadı', { error: error.message })
      return NextResponse.json({ error: 'Lead oluşturulamadı' }, { status: 500 })
    }

    logLeadActivity({
      leadId: data.id,
      activityType: 'LEAD_CREATED',
      description: `Yeni lead oluşturuldu: ${data.business_name}`,
    })

    return NextResponse.json(data, { status: 201 })
  } catch (error) {
    logger.error('Leads POST hatası', { error: String(error) })
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Geçersiz istek' },
      { status: 400 }
    )
  }
}
