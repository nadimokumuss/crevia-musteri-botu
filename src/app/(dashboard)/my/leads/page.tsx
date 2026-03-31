'use client'

import { useCurrentUser } from '@/hooks/use-current-user'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { TelesalesLeadsView } from '@/components/my-leads/telesales-leads-view'

export default function MyLeadsPage() {
  const { user, isLoading } = useCurrentUser()

  if (isLoading) {
    return <div className="py-12 text-center text-muted-foreground">Yükleniyor...</div>
  }

  if (user?.role === 'TELESALES_AGENT') {
    return <TelesalesLeadsView />
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Bu ekran telefon ekibi için açık</CardTitle>
        <CardDescription>
          Aktif iş akışında saha ajanı ekranı kullanılmıyor.
        </CardDescription>
      </CardHeader>
      <CardContent className="text-sm text-muted-foreground">
        Müşteri takibi yalnızca telefon arama listeleri üzerinden yürütülüyor.
      </CardContent>
    </Card>
  )
}
