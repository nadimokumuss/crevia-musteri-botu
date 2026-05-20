import { NextRequest, NextResponse } from 'next/server'
import { hydrateCallListItemsWithInstagram } from '@/infra/supabase/hydrate-call-list-items'
import { listAssignedLeadIds } from '@/infra/supabase/list-assigned-lead-ids'
import { createServiceRoleClient } from '@/infra/supabase/server'
import { generateCallList, selectCallLeadCandidates } from '@/core/routing/call-list-generator'
import { AppError } from '@/lib/errors'
import { logger } from '@/lib/logger'
import { z } from 'zod'
import type { CallListItem } from '@/types/call'
import { isoDateString } from '@/lib/validators'
import { SCORE_THRESHOLDS } from '@/lib/constants'

const PAGE_SIZE = 200

const createCallListSchema = z.object({
  agent_id: z.string().uuid(),
  list_date: isoDateString,
  max_items: z.number().int().min(1).max(100).optional().default(20),
  min_score: z.number().int().min(SCORE_THRESHOLDS.LOW_PRIORITY).max(100).optional().default(20),
})

interface CallLeadRow {
  id: string
  business_name: string
  phone: string | null
  need_score: number
  district_id: string | null
  category: string | null
  ig_username: string | null
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const parsed = createCallListSchema.parse(body)

    const supabase = createServiceRoleClient()

    const { data: agent, error: agentError } = await supabase
      .from('agents')
      .select('id, full_name, role, is_active')
      .eq('id', parsed.agent_id)
      .maybeSingle()

    if (agentError) {
      logger.error('Ajan bilgisi alinamadi', { error: agentError.message })
      return NextResponse.json({ error: 'Ajan bilgisi alinamadi' }, { status: 500 })
    }
    if (!agent) {
      return NextResponse.json({ error: 'Ajan bulunamadi' }, { status: 404 })
    }
    if (agent.role !== 'TELESALES_AGENT') {
      return NextResponse.json(
        { error: 'Manuel arama listesi yalnizca telefon ajanlari icin olusturulabilir' },
        { status: 400 }
      )
    }
    if (!agent.is_active) {
      return NextResponse.json({ error: 'Pasif ajan icin liste olusturulamaz' }, { status: 400 })
    }

    const { data: preferences } = await supabase
      .from('agent_preferences')
      .select('district_ids, categories')
      .eq('agent_id', parsed.agent_id)
      .maybeSingle()

    const districtIds = preferences?.district_ids ?? []
    const categories = preferences?.categories ?? []

    const assignedLeadIds = await listAssignedLeadIds(supabase)

    const candidateLeads = await loadCandidateLeads(supabase, {
      districtIds,
      categories,
      minScore: parsed.min_score,
      maxItems: parsed.max_items,
      assignedLeadIds,
    })

    const selectedLeads = selectCallLeadCandidates(
      candidateLeads.map((lead) => ({
        id: lead.id,
        businessName: lead.business_name,
        phone: lead.phone,
        needScore: lead.need_score,
        districtId: lead.district_id,
        category: lead.category,
        igUsername: lead.ig_username,
      })),
      {
        maxItems: parsed.max_items,
        minScore: parsed.min_score,
        excludedLeadIds: assignedLeadIds,
        districtIds,
        categories,
      }
    )

    if (selectedLeads.length === 0) {
      return NextResponse.json(
        {
          error: 'Tum uygun leadler daha once atanmis. Yeni lead taramasi yapmaniz gerekiyor.',
          code: 'NO_NEW_LEADS',
        },
        { status: 409 }
      )
    }

    const callItems = generateCallList(selectedLeads, {
      maxItems: parsed.max_items,
      minScore: parsed.min_score,
    })

    const leadIds = callItems.map((item) => item.leadId)

    // Atomik RPC: call_lists + assignments + activity log tek transaction'da
    // UNIQUE(agent_id, list_date) ya da UNIQUE(lead_id) çakışırsa Postgres ROLLBACK eder
    const { data: rpcData, error: rpcError } = await supabase.rpc('create_call_list_atomic', {
      p_agent_id: parsed.agent_id,
      p_list_date: parsed.list_date,
      p_items: callItems,
      p_lead_ids: leadIds,
    })

    if (rpcError) {
      // Postgres unique violation → race condition (paralel çağrı kazandı)
      if (rpcError.code === '23505') {
        if (rpcError.message?.includes('unique_agent_call_date')) {
          return NextResponse.json(
            {
              error: 'Bu ajan ve tarih icin zaten bir arama listesi var.',
              code: 'CALL_LIST_ALREADY_EXISTS',
            },
            { status: 409 }
          )
        }
        return NextResponse.json(
          {
            error: 'Secilen leadlerden biri eszamanli olarak atanmis. Lutfen tekrar deneyin.',
            code: 'LEAD_RACE_CONDITION',
          },
          { status: 409 }
        )
      }

      // Custom plpgsql exception
      if (rpcError.code === 'P0001') {
        return NextResponse.json(
          { error: rpcError.message, code: rpcError.message },
          { status: 400 }
        )
      }

      logger.error('Atomik arama listesi olusturma basarisiz', {
        error: rpcError.message,
        code: rpcError.code,
      })
      return NextResponse.json({ error: 'Liste kaydedilemedi' }, { status: 500 })
    }

    const callList = rpcData as Record<string, unknown> & { id: string; items: CallListItem[] }

    const assignedExcluded = candidateLeads.filter((lead) => assignedLeadIds.has(lead.id)).length

    logger.info('Manuel arama listesi olusturuldu', {
      agentId: parsed.agent_id,
      agentName: agent.full_name,
      date: parsed.list_date,
      itemCount: callItems.length,
      assignedExcluded,
      preferencesApplied: districtIds.length > 0 || categories.length > 0,
    })

    return NextResponse.json(
      {
        ...callList,
        assignedExcluded,
        preferencesApplied: districtIds.length > 0 || categories.length > 0,
      },
      { status: 201 }
    )
  } catch (error) {
    logger.error('Calls POST hatasi', { error: String(error) })
    if (error instanceof AppError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.statusCode }
      )
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Gecersiz istek' },
      { status: 400 }
    )
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const agentId = searchParams.get('agent_id')
    const listDate = searchParams.get('list_date')

    const supabase = createServiceRoleClient()

    let query = supabase.from('call_lists').select('*')

    if (agentId) {
      query = query.eq('agent_id', agentId)
    }

    if (listDate) {
      query = query.eq('list_date', listDate)
    }

    query = query.order('list_date', { ascending: false }).limit(20)

    const { data, error } = await query

    if (error) {
      logger.error('Arama listeleri getirilemedi', { error: error.message })
      return NextResponse.json({ error: 'Veriler alinamadi' }, { status: 500 })
    }

    const hydratedLists = await Promise.all(
      (data ?? []).map(async (callList) => ({
        ...callList,
        items: await hydrateCallListItemsWithInstagram(
          supabase,
          (callList.items as CallListItem[])
        ),
      }))
    )

    return NextResponse.json(hydratedLists)
  } catch (error) {
    logger.error('Calls GET hatasi', { error: String(error) })
    return NextResponse.json({ error: 'Sunucu hatasi' }, { status: 500 })
  }
}

async function loadCandidateLeads(
  supabase: ReturnType<typeof createServiceRoleClient>,
  options: {
    districtIds: string[]
    categories: string[]
    minScore: number
    maxItems: number
    assignedLeadIds: Set<string>
  }
): Promise<CallLeadRow[]> {
  const collected: CallLeadRow[] = []
  let page = 0
  let hasMore = true

  while (hasMore) {
    let query = supabase
      .from('leads')
      .select('id, business_name, phone, need_score, district_id, category, ig_username')
      .not('phone', 'is', null)
      .gte('need_score', options.minScore)
      .in('status', ['NEW', 'CONTACTED'])
      .order('need_score', { ascending: false })
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)

    if (options.districtIds.length > 0) {
      query = query.in('district_id', options.districtIds)
    }

    if (options.categories.length > 0) {
      query = query.in('category', options.categories)
    }

    const { data, error } = await query

    if (error) {
      logger.error('Lead adaylari getirilemedi', { error: error.message, page })
      throw new Error('Lead havuzu alinamadi')
    }

    const pageRows = (data ?? []) as CallLeadRow[]
    collected.push(...pageRows)

    const selectedSoFar = selectCallLeadCandidates(
      collected.map((lead) => ({
        id: lead.id,
        businessName: lead.business_name,
        phone: lead.phone,
        needScore: lead.need_score,
        districtId: lead.district_id,
        category: lead.category,
        igUsername: lead.ig_username,
      })),
      {
        maxItems: options.maxItems,
        minScore: options.minScore,
        excludedLeadIds: options.assignedLeadIds,
        districtIds: options.districtIds,
        categories: options.categories,
      }
    )

    if (selectedSoFar.length >= options.maxItems) {
      break
    }

    hasMore = pageRows.length === PAGE_SIZE
    page++
  }

  return collected
}
