/**
 * Kilit yöneticisi - Çatışma önleme
 *
 * assignments tablosunda UNIQUE(lead_id) kısıtlaması bulunur.
 * Bir lead bir kez atandıktan sonra yeniden atanmaz; lock alanları
 * sadece mevcut kaydın eşzamanlı güncellenmesini korur.
 */

import { createServiceRoleClient } from '@/infra/supabase/server'
import { LOCK_DURATION_MINUTES } from '@/lib/constants'
import { ConflictError } from '@/lib/errors'
import { logger } from '@/lib/logger'

export interface LockResult {
  acquired: boolean
  lockId: string | null
  expiresAt: Date | null
}

/**
 * Bir lead için kilit al — tek atomik RPC ile
 *
 * Race-free: PostgreSQL FOR UPDATE + UNIQUE(lead_id) constraint birleşimi.
 */
export async function acquireLock(
  leadId: string,
  agentId: string,
  scheduledDate: string,
  assignmentType: 'VISIT' | 'CALL'
): Promise<LockResult> {
  const supabase = createServiceRoleClient()

  const { data, error } = await supabase.rpc('acquire_assignment_lock', {
    p_lead_id: leadId,
    p_agent_id: agentId,
    p_scheduled_date: scheduledDate,
    p_assignment_type: assignmentType,
    p_lock_minutes: LOCK_DURATION_MINUTES,
  })

  if (error) {
    logger.error('Kilit alma RPC hatası', {
      error: error.message,
      code: error.code,
      leadId,
    })
    return { acquired: false, lockId: null, expiresAt: null }
  }

  const result = data as {
    acquired: boolean
    lockId?: string
    expiresAt?: string
    reason?: string
  }

  if (!result.acquired) {
    if (result.reason === 'LOCKED_BY_OTHER') {
      throw new ConflictError(
        `Bu lead zaten başka bir ajan tarafından kilitlenmiş (süre: ${result.expiresAt ?? 'bilinmiyor'})`
      )
    }
    if (result.reason === 'ALREADY_ASSIGNED') {
      throw new ConflictError('Bu lead daha once bir ajana atanmis. Tekrar atama kapali.')
    }
    if (result.reason === 'RACE_CONDITION') {
      throw new ConflictError('Bu lead aynı anda başka bir işlem tarafından atandı. Tekrar deneyin.')
    }
    return { acquired: false, lockId: null, expiresAt: null }
  }

  logger.info('Kilit alındı', { lockId: result.lockId, leadId, agentId })
  return {
    acquired: true,
    lockId: result.lockId ?? null,
    expiresAt: result.expiresAt ? new Date(result.expiresAt) : null,
  }
}

/**
 * Kilidi serbest bırak
 */
export async function releaseLock(lockId: string): Promise<boolean> {
  const supabase = createServiceRoleClient()

  const { error } = await supabase
    .from('assignments')
    .update({
      locked_at: null,
      lock_expires_at: null,
      locked_by: null,
    })
    .eq('id', lockId)

  if (error) {
    logger.error('Kilit serbest bırakılamadı', { lockId, error: error.message })
    return false
  }

  return true
}

/**
 * Süresi dolmuş tüm kilitleri temizle (cron'dan çağrılır)
 */
export async function cleanExpiredLocks(): Promise<number> {
  const supabase = createServiceRoleClient()

  const { data, error } = await supabase
    .from('assignments')
    .update({ locked_at: null, lock_expires_at: null, locked_by: null })
    .lt('lock_expires_at', new Date().toISOString())
    .not('lock_expires_at', 'is', null)
    .select('id')

  if (error) {
    logger.error('Kilit temizleme hatası', { error: error.message })
    return 0
  }

  return data?.length ?? 0
}
