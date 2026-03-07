'use client'

import { useCurrentUser } from '@/hooks/use-current-user'
import { TelesalesLeadsView } from '@/components/my-leads/telesales-leads-view'
import { FieldAgentLeadsView } from '@/components/my-leads/field-agent-leads-view'

export default function MyLeadsPage() {
  const { user, isLoading } = useCurrentUser()

  if (isLoading) {
    return <div className="py-12 text-center text-muted-foreground">Yükleniyor...</div>
  }

  if (user?.role === 'TELESALES_AGENT') {
    return <TelesalesLeadsView />
  }

  return <FieldAgentLeadsView />
}
