import { createServiceRoleClient } from '@/infra/supabase/server'

type SupabaseClient = ReturnType<typeof createServiceRoleClient>

export function isInstagramDiscoverySourceSchemaError(
  error: { message?: string | null; details?: string | null } | null | undefined
) {
  const text = `${error?.message ?? ''} ${error?.details ?? ''}`.toLowerCase()
  return text.includes('ig_discovery_source') || text.includes('schema cache')
}

export async function updateLeadWithInstagramSchemaFallback(
  supabase: SupabaseClient,
  leadId: string,
  update: Record<string, unknown>
) {
  const { error } = await supabase
    .from('leads')
    .update(update)
    .eq('id', leadId)

  if (!error) {
    return
  }

  if (!isInstagramDiscoverySourceSchemaError(error) || !('ig_discovery_source' in update)) {
    throw new Error(error.message)
  }

  const legacyUpdate = { ...update }
  delete legacyUpdate.ig_discovery_source

  const { error: fallbackError } = await supabase
    .from('leads')
    .update(legacyUpdate)
    .eq('id', leadId)

  if (fallbackError) {
    throw new Error(fallbackError.message)
  }
}
