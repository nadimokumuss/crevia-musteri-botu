import { createServiceRoleClient } from '@/infra/supabase/server'
import type { Lead } from '@/types/database'

type SupabaseClient = ReturnType<typeof createServiceRoleClient>

export async function loadPendingInstagramLeads(
  supabase: SupabaseClient,
  districtId: string | undefined,
  limit: number
) {
  const buckets = await Promise.all([
    queryPendingInstagramLeads(supabase, districtId, limit, { fresh: true, directOnly: true }),
    queryPendingInstagramLeads(supabase, districtId, limit, { fresh: false, directOnly: true }),
    queryProfileBackfillLeads(supabase, districtId, limit),
    queryPendingInstagramLeads(supabase, districtId, limit, { fresh: true, directOnly: false }),
    queryPendingInstagramLeads(supabase, districtId, limit, { fresh: false, directOnly: false }),
  ])

  const failedBucket = buckets.find((bucket) => bucket.error)
  if (failedBucket?.error) {
    return { leads: null, error: failedBucket.error }
  }

  const leads: Lead[] = []
  const seen = new Set<string>()

  for (const bucket of buckets) {
    for (const lead of bucket.leads ?? []) {
      if (seen.has(lead.id)) {
        continue
      }

      seen.add(lead.id)
      leads.push(lead)

      if (leads.length >= limit) {
        return { leads, error: null }
      }
    }
  }

  return { leads, error: null }
}

export async function loadNextPendingInstagramLead(
  supabase: SupabaseClient,
  districtId?: string
) {
  const { leads, error } = await loadPendingInstagramLeads(supabase, districtId, 1)

  if (error) {
    return { lead: null, error }
  }

  return { lead: leads?.[0] ?? null, error: null }
}

export async function countPendingInstagramLeads(
  supabase: SupabaseClient,
  districtId: string | undefined
) {
  let nullCountQuery = supabase
    .from('leads')
    .select('*', { count: 'exact', head: true })
    .is('ig_username', null)

  let emptyCountQuery = supabase
    .from('leads')
    .select('*', { count: 'exact', head: true })
    .eq('ig_username', '')

  let backfillCountQuery = supabase
    .from('leads')
    .select('*', { count: 'exact', head: true })
    .not('ig_username', 'is', null)
    .neq('ig_username', '')
    .in('ig_discovery_source', ['WEBSITE_URL', 'WEBSITE_HTML'])
    .is('ig_follower_count', null)
    .is('ig_post_count', null)
    .is('ig_last_post_date', null)

  if (districtId) {
    nullCountQuery = nullCountQuery.eq('district_id', districtId)
    emptyCountQuery = emptyCountQuery.eq('district_id', districtId)
    backfillCountQuery = backfillCountQuery.eq('district_id', districtId)
  }

  const [{ count: nullCount }, { count: emptyCount }, { count: backfillCount }] = await Promise.all([
    nullCountQuery,
    emptyCountQuery,
    backfillCountQuery,
  ])

  return (nullCount ?? 0) + (emptyCount ?? 0) + (backfillCount ?? 0)
}

async function queryPendingInstagramLeads(
  supabase: SupabaseClient,
  districtId: string | undefined,
  limit: number,
  options: { fresh: boolean; directOnly: boolean }
) {
  let query = supabase
    .from('leads')
    .select('*')
    .order('updated_at', { ascending: true })
    .limit(limit)

  query = options.fresh ? query.is('ig_username', null) : query.eq('ig_username', '')

  if (options.directOnly) {
    query = query.ilike('website', '%instagram.com/%')
  }

  if (districtId) {
    query = query.eq('district_id', districtId)
  }

  const { data, error } = await query
  return { leads: (data as Lead[] | null) ?? [], error }
}

async function queryProfileBackfillLeads(
  supabase: SupabaseClient,
  districtId: string | undefined,
  limit: number
) {
  let query = supabase
    .from('leads')
    .select('*')
    .not('ig_username', 'is', null)
    .neq('ig_username', '')
    .in('ig_discovery_source', ['WEBSITE_URL', 'WEBSITE_HTML'])
    .is('ig_follower_count', null)
    .is('ig_post_count', null)
    .is('ig_last_post_date', null)
    .order('updated_at', { ascending: true })
    .limit(limit)

  if (districtId) {
    query = query.eq('district_id', districtId)
  }

  const { data, error } = await query
  return { leads: (data as Lead[] | null) ?? [], error }
}
