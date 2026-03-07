import { createServiceRoleClient } from './server'
import { logger } from '@/lib/logger'
import type { ActivityType } from '@/types'

interface LogActivityParams {
  leadId: string
  activityType: ActivityType
  description: string
  agentId?: string | null
  oldValue?: string | null
  newValue?: string | null
  metadata?: Record<string, unknown>
}

export async function logLeadActivity(params: LogActivityParams): Promise<void> {
  try {
    const supabase = createServiceRoleClient()

    const { error } = await supabase.from('lead_activities').insert({
      lead_id: params.leadId,
      activity_type: params.activityType,
      description: params.description,
      agent_id: params.agentId ?? null,
      old_value: params.oldValue ?? null,
      new_value: params.newValue ?? null,
      metadata: params.metadata ?? {},
    })

    if (error) {
      logger.error('Aktivite logu yazılamadı', {
        error: error.message,
        leadId: params.leadId,
        type: params.activityType,
      })
    }
  } catch (error) {
    logger.error('Aktivite loglama hatası', {
      error: String(error),
      leadId: params.leadId,
    })
  }
}
