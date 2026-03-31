import type { AgentRole } from '@/types/database'

export interface NavItem {
  href: string
  label: string
  icon: string
  roles: AgentRole[]
}

export const NAV_ITEMS: NavItem[] = [
  // Admin menüleri
  { href: '/analytics', label: 'Analitik', icon: '📊', roles: ['ADMIN'] },
  { href: '/leads', label: 'Müşteriler', icon: '📋', roles: ['ADMIN'] },
  { href: '/calls', label: 'Aramalar', icon: '📞', roles: ['ADMIN'] },
  { href: '/agents', label: 'Ajanlar', icon: '👥', roles: ['ADMIN'] },
  { href: '/admin', label: 'Yönetim', icon: '⚙️', roles: ['ADMIN'] },

  // Telesales ajanı menüleri
  { href: '/my/calls', label: 'Arama Listem', icon: '📞', roles: ['TELESALES_AGENT'] },
  { href: '/my/leads', label: 'Müşterilerim', icon: '📋', roles: ['TELESALES_AGENT'] },

  // Ortak
  { href: '/settings', label: 'Ayarlar', icon: '🔧', roles: ['ADMIN', 'FIELD_AGENT', 'TELESALES_AGENT'] },
]

export const ROLE_CONFIG: Record<AgentRole, { label: string; className: string }> = {
  ADMIN: { label: 'Yönetici', className: 'bg-purple-100 text-purple-800' },
  FIELD_AGENT: { label: 'Saha Ajanı', className: 'bg-green-100 text-green-800' },
  TELESALES_AGENT: { label: 'Telefon Ajanı', className: 'bg-blue-100 text-blue-800' },
}

export function filterNavByRole(role: AgentRole): NavItem[] {
  return NAV_ITEMS.filter((item) => item.roles.includes(role))
}
