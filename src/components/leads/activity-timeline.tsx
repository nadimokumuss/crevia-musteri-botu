'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import type { LeadActivity, ActivityType } from '@/types'

const ACTIVITY_CONFIG: Record<ActivityType, { label: string; color: string }> = {
  STATUS_CHANGE: { label: 'Durum', color: 'bg-blue-500' },
  ASSIGNMENT_CREATED: { label: 'Atama', color: 'bg-green-500' },
  ASSIGNMENT_UPDATED: { label: 'Atama', color: 'bg-emerald-500' },
  CALL_LOGGED: { label: 'Arama', color: 'bg-yellow-500' },
  VISIT_LOGGED: { label: 'Ziyaret', color: 'bg-purple-500' },
  SCORE_CALCULATED: { label: 'Puanlama', color: 'bg-orange-500' },
  NOTE_ADDED: { label: 'Not', color: 'bg-gray-500' },
  LEAD_CREATED: { label: 'Oluşturma', color: 'bg-teal-500' },
}

function formatRelativeTime(dateStr: string): string {
  const now = Date.now()
  const date = new Date(dateStr).getTime()
  const diff = now - date

  const minutes = Math.floor(diff / 60000)
  if (minutes < 1) return 'Az önce'
  if (minutes < 60) return `${minutes} dk önce`

  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} saat önce`

  const days = Math.floor(hours / 24)
  if (days < 30) return `${days} gün önce`

  const months = Math.floor(days / 30)
  return `${months} ay önce`
}

function formatFullDate(dateStr: string): string {
  return new Date(dateStr).toLocaleString('tr-TR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function ActivityTimeline({ leadId }: { leadId: string }) {
  const [activities, setActivities] = useState<LeadActivity[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    async function fetchActivities() {
      try {
        const response = await fetch(`/api/leads/${leadId}/activities`)
        if (response.ok) {
          const data = await response.json()
          setActivities(data)
        }
      } finally {
        setIsLoading(false)
      }
    }
    fetchActivities()
  }, [leadId])

  if (isLoading) {
    return <div className="py-8 text-center text-muted-foreground">Yükleniyor...</div>
  }

  if (activities.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <p className="text-muted-foreground">Henüz aktivite kaydı yok</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Aktivite Geçmişi</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="relative space-y-0">
          {/* Timeline çizgisi */}
          <div className="absolute left-[7px] top-2 bottom-2 w-px bg-border" />

          {activities.map((activity) => {
            const config = ACTIVITY_CONFIG[activity.activity_type]
            return (
              <div key={activity.id} className="relative flex gap-4 pb-6 last:pb-0">
                {/* Nokta */}
                <div className={`relative z-10 mt-1.5 h-[15px] w-[15px] shrink-0 rounded-full ${config.color}`} />

                {/* İçerik */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-start gap-2 flex-wrap">
                    <Badge variant="outline" className="text-xs shrink-0">
                      {config.label}
                    </Badge>
                    <span
                      className="text-xs text-muted-foreground shrink-0"
                      title={formatFullDate(activity.created_at)}
                    >
                      {formatRelativeTime(activity.created_at)}
                    </span>
                  </div>

                  <p className="mt-1 text-sm">{activity.description}</p>

                  {activity.old_value && activity.new_value && (
                    <div className="mt-1 text-xs text-muted-foreground">
                      <span className="line-through">{activity.old_value}</span>
                      {' → '}
                      <span className="font-medium text-foreground">{activity.new_value}</span>
                    </div>
                  )}

                  {activity.agents?.full_name && (
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {activity.agents.full_name}
                    </p>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}
