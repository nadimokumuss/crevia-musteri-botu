import { createServiceRoleClient } from '@/infra/supabase/server'
import type { Lead } from '@/types/database'
import { isInstagramDiscoverySourceSchemaError } from './schema-fallback'

type SupabaseClient = ReturnType<typeof createServiceRoleClient>

interface PendingInstagramLeadOptions {
  includeBackfill?: boolean
}

export async function loadPendingInstagramLeads(
  supabase: SupabaseClient,
  districtId: string | undefined,
  limit: number,
  options: PendingInstagramLeadOptions = {}
) {
  const buckets = [
    queryPendingInstagramLeads(supabase, districtId, limit, { fresh: true, directOnly: true }),
    queryPendingInstagramLeads(supabase, districtId, limit, { fresh: false, directOnly: true }),
    queryPendingInstagramLeads(supabase, districtId, limit, { fresh: true, directOnly: false }),
    queryPendingInstagramLeads(supabase, districtId, limit, { fresh: false, directOnly: false }),
  ]

  if (options.includeBackfill !== false) {
    buckets.splice(2, 0, queryProfileBackfillLeads(supabase, districtId, limit))
  }

  const bucketResults = await Promise.all(buckets)

  const failedBucket = bucketResults.find((bucket) => bucket.error)
  if (failedBucket?.error) {
    return { leads: null, error: failedBucket.error }
  }

  const leads: Lead[] = []
  const seen = new Set<string>()

  for (const bucket of bucketResults) {
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
  districtId?: string,
  options: PendingInstagramLeadOptions = {}
) {
  const { leads, error } = await loadPendingInstagramLeads(supabase, districtId, 1, options)

  if (error) {
    return { lead: null, error }
  }

  return { lead: leads?.[0] ?? null, error: null }
}

export async function countPendingInstagramLeads(
  supabase: SupabaseClient,
  districtId: string | undefined,
  options: PendingInstagramLeadOptions = {}
) {
  let nullCountQuery = supabase
    .from('leads')
    .select('*', { count: 'exact', head: true })
    .is('ig_username', null)

  let emptyCountQuery = supabase
    .from('leads')
    .select('*', { count: 'exact', head: true })
    .eq('ig_username', '')

  if (districtId) {
    nullCountQuery = nullCountQuery.eq('district_id', districtId)
    emptyCountQuery = emptyCountQuery.eq('district_id', districtId)
  }

  const backfillCountPromise =
    options.includeBackfill !== false
      ? countProfileBackfillLeads(supabase, districtId)
      : Promise.resolve(0)

  const [{ count: nullCount }, { count: emptyCount }, backfillResult] = await Promise.all([
    nullCountQuery,
    emptyCountQuery,
    backfillCountPromise,
  ])

  return (nullCount ?? 0) + (emptyCount ?? 0) + backfillResult
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
  if (error && isInstagramDiscoverySourceSchemaError(error)) {
    return { leads: [], error: null }
  }
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
  if (error && isInstagramDiscoverySourceSchemaError(error)) {
    return { leads: [], error: null }
  }
  return { leads: (data as Lead[] | null) ?? [], error }
}

async function countProfileBackfillLeads(
  supabase: SupabaseClient,
  districtId: string | undefined
) {
  let query = supabase
    .from('leads')
    .select('*', { count: 'exact', head: true })
    .not('ig_username', 'is', null)
    .neq('ig_username', '')
    .in('ig_discovery_source', ['WEBSITE_URL', 'WEBSITE_HTML'])
    .is('ig_follower_count', null)
    .is('ig_post_count', null)
    .is('ig_last_post_date', null)

  if (districtId) {
    query = query.eq('district_id', districtId)
  }

  const { count, error } = await query
  if (error && isInstagramDiscoverySourceSchemaError(error)) {
    return 0
  }
  return count ?? 0
}
