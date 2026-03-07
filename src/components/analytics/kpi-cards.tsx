'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { AnalyticsKPI } from '@/types'

interface KPICardsProps {
  data: AnalyticsKPI
}

interface KPIItem {
  title: string
  value: string | number
  description: string
}

export function KPICards({ data }: KPICardsProps) {
  const items: KPIItem[] = [
    {
      title: 'Toplam Lead',
      value: data.totalLeads,
      description: `Bu hafta +${data.newLeadsThisWeek}, geçen hafta +${data.newLeadsLastWeek}`,
    },
    {
      title: 'Dönüşüm Oranı',
      value: `%${data.conversionRate}`,
      description: `${data.totalWon} kazanıldı, ${data.totalLost} kaybedildi`,
    },
    {
      title: 'Ort. İhtiyaç Puanı',
      value: data.avgNeedScore,
      description: '0-100 arası puan ortalaması',
    },
    {
      title: 'Görev Tamamlama',
      value: `%${data.completionRate}`,
      description: `${data.completedAssignments} / ${data.totalAssignments} görev`,
    },
    {
      title: 'Arama Tamamlama',
      value: `%${data.callCompletionRate}`,
      description: `${data.totalCallsMade} arama yapıldı`,
    },
    {
      title: 'Aktif Ajan',
      value: data.activeAgents,
      description: 'Aktif saha ve telefon ajanları',
    },
  ]

  return (
    <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-6">
      {items.map((item) => (
        <Card key={item.title}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {item.title}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{item.value}</div>
            <p className="text-xs text-muted-foreground mt-1">{item.description}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
