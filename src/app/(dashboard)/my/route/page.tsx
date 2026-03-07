'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { NotesDialog } from '@/components/shared/notes-dialog'
import { PreferencesBanner } from '@/components/shared/preferences-banner'
import type { RouteStop } from '@/types/database'

interface MyRouteData {
  id: string
  route_date: string
  stops: RouteStop[]
  total_distance_km: number
  estimated_duration_min: number
  is_optimized: boolean
}

const STOP_STATUSES = [
  { value: 'PENDING', label: 'Bekliyor', className: 'bg-gray-100 text-gray-800' },
  { value: 'VISITED', label: 'Ziyaret Edildi', className: 'bg-blue-100 text-blue-800' },
  { value: 'MEETING', label: 'Görüşme Yapıldı', className: 'bg-indigo-100 text-indigo-800' },
  { value: 'DEMO', label: 'Deneme Çekimi', className: 'bg-purple-100 text-purple-800' },
  { value: 'PROPOSAL', label: 'Teklif Bırakıldı', className: 'bg-amber-100 text-amber-800' },
  { value: 'CLOSED', label: 'Kapandı', className: 'bg-green-100 text-green-800' },
  { value: 'SKIPPED', label: 'Atlandı', className: 'bg-red-100 text-red-800' },
]

export default function MyRoutePage() {
  const [route, setRoute] = useState<MyRouteData | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [notesTarget, setNotesTarget] = useState<{ leadId: string; notes: string } | null>(null)
  const [selectedDate, setSelectedDate] = useState(() => new Date().toISOString().split('T')[0])

  useEffect(() => {
    loadRoute()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDate])

  async function enrichStops(routeData: MyRouteData): Promise<MyRouteData> {
    const stops = routeData.stops ?? []
    const missingIds = stops.filter((s) => !s.business_name).map((s) => s.lead_id)
    if (missingIds.length === 0) return routeData

    try {
      const res = await fetch(`/api/leads?limit=50&lead_ids=${missingIds.join(',')}`)
      if (!res.ok) return routeData
      const data = await res.json()
      const leadsMap = new Map(
        (data.data ?? []).map((l: { id: string; business_name: string; phone?: string }) => [l.id, l])
      )

      const enriched = stops.map((s) => {
        if (s.business_name) return s
        const lead = leadsMap.get(s.lead_id) as { business_name: string; phone?: string } | undefined
        if (!lead) return s
        return { ...s, business_name: lead.business_name, phone: lead.phone ?? s.phone }
      })

      return { ...routeData, stops: enriched }
    } catch {
      return routeData
    }
  }

  async function loadRoute() {
    setIsLoading(true)
    try {
      const response = await fetch(`/api/my/route?date=${selectedDate}`)
      if (response.ok) {
        const data = await response.json()
        if (data) {
          const enriched = await enrichStops(data)
          setRoute(enriched)
        } else {
          setRoute(null)
        }
      }
    } finally {
      setIsLoading(false)
    }
  }

  async function updateStopStatus(leadId: string, status: string) {
    // Optimistik güncelleme
    setRoute((prev) => {
      if (!prev) return prev
      return {
        ...prev,
        stops: prev.stops.map((s) =>
          s.lead_id === leadId
            ? { ...s, status, completed_at: status === 'PENDING' ? undefined : new Date().toISOString() }
            : s
        ),
      }
    })

    const response = await fetch(`/api/my/route/stops/${leadId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status, date: selectedDate }),
    })

    if (!response.ok) {
      await loadRoute()
    }
  }

  async function saveNotes(leadId: string, notes: string) {
    // Optimistik güncelleme
    setRoute((prev) => {
      if (!prev) return prev
      return {
        ...prev,
        stops: prev.stops.map((s) =>
          s.lead_id === leadId ? { ...s, notes } : s
        ),
      }
    })
    setNotesTarget(null)

    const response = await fetch(`/api/my/route/stops/${leadId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ notes, date: selectedDate }),
    })

    if (!response.ok) {
      await loadRoute()
    }
  }

  if (isLoading) {
    return <div className="py-12 text-center text-muted-foreground">Yükleniyor...</div>
  }

  const stops = route?.stops ?? []
  const completed = stops.filter((s) => s.status !== 'PENDING').length

  return (
    <div className="space-y-6">
      <PreferencesBanner />
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Ziyaret Rotam</h1>
          <p className="text-muted-foreground">
            {route ? `${route.route_date} tarihli rota` : 'Seçili tarih için atanmış rota yok'}
          </p>
        </div>
        <Input
          type="date"
          value={selectedDate}
          onChange={(e) => setSelectedDate(e.target.value)}
          className="w-full md:w-44"
        />
      </div>

      {route && (
        <>
          {/* İstatistikler */}
          <div className="grid gap-4 md:grid-cols-4">
            <Card>
              <CardContent className="pt-6">
                <div className="text-2xl font-bold">{stops.length}</div>
                <p className="text-sm text-muted-foreground">Toplam Durak</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="text-2xl font-bold">{completed}</div>
                <p className="text-sm text-muted-foreground">Tamamlanan</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="text-2xl font-bold">{route.total_distance_km.toFixed(1)} km</div>
                <p className="text-sm text-muted-foreground">Toplam Mesafe</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="text-2xl font-bold">~{route.estimated_duration_min} dk</div>
                <p className="text-sm text-muted-foreground">Tahmini Süre</p>
              </CardContent>
            </Card>
          </div>

          {/* Durak Listesi */}
          <Card>
            <CardHeader>
              <CardTitle>Durak Listesi</CardTitle>
              <CardDescription>
                Her durağın durumunu güncelleyebilir ve not ekleyebilirsiniz
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 md:space-y-0">
              {/* Mobil: Kart bazlı */}
              <div className="md:hidden space-y-3">
                {stops.map((stop) => {
                  const statusInfo = STOP_STATUSES.find((s) => s.value === stop.status)
                  return (
                    <div key={`${stop.lead_id}-${stop.order}`} className="rounded-lg border p-3 space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-muted-foreground">{stop.order}.</span>
                            <Link href={`/leads/${stop.lead_id}`} className="font-medium text-blue-600 hover:underline">
                              {stop.business_name ?? stop.lead_id.slice(0, 8)}
                            </Link>
                          </div>
                          <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                            {stop.phone ? (
                              <a href={`tel:${stop.phone}`} className="text-blue-600 underline">{stop.phone}</a>
                            ) : null}
                            <a
                              href={`https://www.google.com/maps/dir/?api=1&destination=${stop.lat},${stop.lng}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-blue-600 underline"
                            >
                              Yol Tarifi
                            </a>
                          </div>
                        </div>
                        <Badge variant="secondary" className={`shrink-0 ${statusInfo?.className ?? ''}`}>
                          {statusInfo?.label ?? stop.status}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-2">
                        <Select
                          value={stop.status}
                          onValueChange={(value) => updateStopStatus(stop.lead_id, value)}
                        >
                          <SelectTrigger className="flex-1">
                            <SelectValue placeholder="Seçin" />
                          </SelectTrigger>
                          <SelectContent>
                            {STOP_STATUSES.map((s) => (
                              <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setNotesTarget({ leadId: stop.lead_id, notes: stop.notes ?? '' })}
                        >
                          {stop.notes ? '✎' : 'Not'}
                        </Button>
                      </div>
                    </div>
                  )
                })}
              </div>

              {/* Masaüstü: Tablo */}
              <div className="hidden md:block">
                <table className="w-full">
                  <thead>
                    <tr className="border-b text-left text-sm font-medium text-muted-foreground">
                      <th className="pb-2 w-12">Sıra</th>
                      <th className="pb-2">İşletme</th>
                      <th className="pb-2">Telefon</th>
                      <th className="pb-2">Durum</th>
                      <th className="pb-2">İşlemler</th>
                      <th className="pb-2">Navigasyon</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stops.map((stop) => {
                      const statusInfo = STOP_STATUSES.find((s) => s.value === stop.status)
                      return (
                        <tr key={`${stop.lead_id}-${stop.order}`} className="border-b">
                          <td className="py-3 font-bold">{stop.order}</td>
                          <td className="py-3 font-medium">
                            <Link href={`/leads/${stop.lead_id}`} className="text-blue-600 hover:underline">
                              {stop.business_name ?? stop.lead_id.slice(0, 8)}
                            </Link>
                          </td>
                          <td className="py-3">
                            {stop.phone ? <a href={`tel:${stop.phone}`} className="text-blue-600 underline">{stop.phone}</a> : '-'}
                          </td>
                          <td className="py-3">
                            <Badge variant="secondary" className={statusInfo?.className ?? ''}>
                              {statusInfo?.label ?? stop.status}
                            </Badge>
                          </td>
                          <td className="py-3">
                            <div className="flex items-center gap-1">
                              <Select value={stop.status} onValueChange={(value) => updateStopStatus(stop.lead_id, value)}>
                                <SelectTrigger className="w-[150px]"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                  {STOP_STATUSES.map((s) => (
                                    <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              <Button variant="outline" size="sm" onClick={() => setNotesTarget({ leadId: stop.lead_id, notes: stop.notes ?? '' })}>
                                {stop.notes ? '✎' : 'Not'}
                              </Button>
                            </div>
                          </td>
                          <td className="py-3">
                            <a
                              href={`https://www.google.com/maps/dir/?api=1&destination=${stop.lat},${stop.lng}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-sm text-blue-600 underline"
                            >
                              Google Maps
                            </a>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </>
      )}

      {!route && !isLoading && (
        <Card>
          <CardContent className="py-12">
            <p className="text-center text-muted-foreground">
              Seçili tarih için atanmış bir rota bulunmuyor.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Not Dialog */}
      {notesTarget && (
        <NotesDialog
          open={!!notesTarget}
          onClose={() => setNotesTarget(null)}
          onSave={(notes) => saveNotes(notesTarget.leadId, notes)}
          initialNotes={notesTarget.notes}
          title="Durak Notu"
        />
      )}
    </div>
  )
}
