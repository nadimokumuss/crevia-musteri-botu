/**
 * Supabase Auth yapılandırması + JWT rol yönetimi
 */

import { createServerSupabaseClient } from '@/infra/supabase/server'
import type { AgentRole } from '@/types/database'

export interface AuthUser {
  id: string
  email: string
  role: AgentRole
  agentId: string | null
}

/**
 * Mevcut oturumdaki kullanıcıyı al
 */
export async function getCurrentUser(): Promise<AuthUser | null> {
  const supabase = await createServerSupabaseClient()

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()

  if (error || !user) return null

  const role = (user.user_metadata?.role as AgentRole) ?? 'TELESALES_AGENT'

  // Agent kaydını bul
  const { data: agent } = await supabase
    .from('agents')
    .select('id')
    .eq('user_id', user.id)
    .single()

  return {
    id: user.id,
    email: user.email ?? '',
    role,
    agentId: agent?.id ?? null,
  }
}

/**
 * Kullanıcının belirtilen role sahip olup olmadığını kontrol et
 */
export function hasRole(user: AuthUser, ...roles: AgentRole[]): boolean {
  return roles.includes(user.role)
}

/**
 * Kullanıcının admin olup olmadığını kontrol et
 */
export function isAdmin(user: AuthUser): boolean {
  return user.role === 'ADMIN'
}

/**
 * Sayfa erişim yetki haritası
 */
export const PAGE_PERMISSIONS: Record<string, AgentRole[]> = {
  '/admin': ['ADMIN'],
  '/agents': ['ADMIN'],
  '/settings': ['ADMIN'],
  '/leads': ['ADMIN', 'FIELD_AGENT', 'TELESALES_AGENT'],
  '/routes': ['ADMIN', 'FIELD_AGENT'],
  '/calls': ['ADMIN', 'TELESALES_AGENT'],
}
