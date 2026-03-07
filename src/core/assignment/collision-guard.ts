/**
 * Kilit yöneticisi - Çatışma önleme
 *
 * assignments tablosunda UNIQUE(lead_id, scheduled_date, assignment_type)
 * kısıtlaması + lock_expires_at ile otomatik kilit süresi.
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
 * Bir lead için kilit al
 *
 * Aynı lead + tarih + tip kombinasyonu için zaten aktif bir atama/kilit varsa
 * çatışma hatası fırlatır.
 */
export async function acquireLock(
  leadId: string,
  agentId: string,
  scheduledDate: string,
  assignmentType: 'VISIT' | 'CALL'
): Promise<LockResult> {
  const supabase = createServiceRoleClient()
  const now = new Date()
  const expiresAt = new Date(now.getTime() + LOCK_DURATION_MINUTES * 60 * 1000)

  // Önce süresi dolmuş kilitleri temizle
  const { error: cleanupError } = await supabase
    .from('assignments')
    .update({ locked_at: null, lock_expires_at: null, locked_by: null })
    .lt('lock_expires_at', now.toISOString())
    .not('lock_expires_at', 'is', null)

  if (cleanupError) {
    logger.warn('Suresi dolmus kilit temizleme basarisiz', { error: cleanupError.message })
  }

  // Mevcut atama/kilit kontrolü
  const { data: existing } = await supabase
    .from('assignments')
    .select('id, agent_id, status, locked_by, lock_expires_at')
    .eq('lead_id', leadId)
    .eq('scheduled_date', scheduledDate)
    .eq('assignment_type', assignmentType)
    .single()

  if (existing) {
    // Zaten tamamlanmış veya iptal edilmişse yeni atama yapılabilir
    if (existing.status === 'COMPLETED' || existing.status === 'CANCELLED') {
      // Üzerine yazılabilir
    } else if (existing.locked_by && existing.locked_by !== agentId) {
      // Başka biri tarafından kilitli
      const lockExpires = existing.lock_expires_at ? new Date(existing.lock_expires_at) : null
      if (lockExpires && lockExpires > now) {
        throw new ConflictError(
          `Bu lead zaten başka bir ajan tarafından kilitlenmiş (süre: ${lockExpires.toISOString()})`
        )
      }
    } else if (existing.agent_id !== agentId && existing.status === 'IN_PROGRESS') {
      throw new ConflictError('Bu lead zaten başka bir ajana atanmış ve üzerinde çalışılıyor')
    }

    // Mevcut kaydı güncelle
    const { error } = await supabase
      .from('assignments')
      .update({
        agent_id: agentId,
        locked_at: now.toISOString(),
        lock_expires_at: expiresAt.toISOString(),
        locked_by: agentId,
        status: 'PENDING',
      })
      .eq('id', existing.id)

    if (error) {
      logger.error('Kilit güncellenemedi', { error: error.message })
      return { acquired: false, lockId: null, expiresAt: null }
    }

    return { acquired: true, lockId: existing.id, expiresAt }
  }

  // Yeni atama + kilit oluştur
  const { data: newAssignment, error: insertError } = await supabase
    .from('assignments')
    .insert({
      lead_id: leadId,
      agent_id: agentId,
      assignment_type: assignmentType,
      scheduled_date: scheduledDate,
      status: 'PENDING',
      locked_at: now.toISOString(),
      lock_expires_at: expiresAt.toISOString(),
      locked_by: agentId,
    })
    .select()
    .single()

  if (insertError) {
    // UNIQUE constraint violation -> çatışma
    if (insertError.code === '23505') {
      throw new ConflictError('Bu lead için aynı tarih ve tipte zaten bir atama mevcut')
    }
    logger.error('Kilit oluşturulamadı', { error: insertError.message })
    return { acquired: false, lockId: null, expiresAt: null }
  }

  logger.info('Kilit alındı', { lockId: newAssignment.id, leadId, agentId })
  return { acquired: true, lockId: newAssignment.id, expiresAt }
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
 * Süresi dolmuş tüm kilitleri temizle
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
