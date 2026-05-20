import type { AgentRole } from '@/types/database'

export const PUBLIC_PATH_PREFIXES = ['/login', '/api/auth', '/auth', '/api/cron'] as const

export const PAGE_PERMISSIONS: Record<string, AgentRole[]> = {
  '/admin': ['ADMIN'],
  '/agents': ['ADMIN'],
  '/settings': ['ADMIN', 'FIELD_AGENT', 'TELESALES_AGENT'],
  '/leads': ['ADMIN'],
  '/calls': ['ADMIN', 'TELESALES_AGENT'],
  '/my/calls': ['FIELD_AGENT', 'TELESALES_AGENT'],
  '/my/leads': ['FIELD_AGENT', 'TELESALES_AGENT'],
  '/api/agents': ['ADMIN'],
  '/api/leads': ['ADMIN'],
  '/api/assignments': ['ADMIN'],
  '/api/calls': ['ADMIN', 'TELESALES_AGENT'],
  '/api/scraper': ['ADMIN'],
  '/api/weekly-plan': ['ADMIN'],
  '/api/daily-plan': ['ADMIN'],
  '/api/districts': ['ADMIN'],
  '/api/analytics': ['ADMIN', 'FIELD_AGENT', 'TELESALES_AGENT'],
  '/api/my': ['FIELD_AGENT', 'TELESALES_AGENT'],
}

export function getAllowedRolesForPath(pathname: string): AgentRole[] | null {
  for (const [path, allowedRoles] of Object.entries(PAGE_PERMISSIONS)) {
    if (pathname.startsWith(path)) {
      return allowedRoles
    }
  }

  return null
}

export function getDefaultPathForRole(role: AgentRole): string {
  return role === 'ADMIN' ? '/analytics' : '/my/calls'
}
