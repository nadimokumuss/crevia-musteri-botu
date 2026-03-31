import type { CallListItem } from '@/types/call'
import { createServiceRoleClient } from '@/infra/supabase/server'

export async function hydrateCallListItemsWithInstagram(
  supabase: ReturnType<typeof createServiceRoleClient>,
  items: CallListItem[]
): Promise<CallListItem[]> {
  const missingInstagramLeadIds = items
    .filter((item) => !item.igUsername)
    .map((item) => item.leadId)

  if (missingInstagramLeadIds.length === 0) {
    return items.map((item) => ({
      ...item,
      igUsername: item.igUsername || null,
    }))
  }

  const { data } = await supabase
    .from('leads')
    .select('id, ig_username')
    .in('id', missingInstagramLeadIds)

  const instagramMap = new Map<string, string | null>()
  for (const lead of data ?? []) {
    instagramMap.set(lead.id as string, (lead.ig_username as string | null) || null)
  }

  return items.map((item) => ({
    ...item,
    igUsername: item.igUsername || instagramMap.get(item.leadId) || null,
  }))
}
