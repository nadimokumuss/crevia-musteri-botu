'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { RouteMap } from '@/components/maps/route-map'
import { RouteExportButtons } from '@/components/routes/route-export-buttons'
import { NotesDialog } from '@/components/shared/notes-dialog'
import type { Route, RouteStop, Agent, Lead } from '@/types/database'

const STOP_STATUSES: Record<string, string> = {
  PENDING: 'Bekliyor',
  VISITED: 'Ziyaret Edildi',
  MEETING: 'Görüşme Yapıldı',
  DEMO: 'Deneme Çekimi',
  PROPOSAL: 'Teklif Bırakıldı',
  CLOSED: 'Kapandı',
  SKIPPED: 'Atlandı',
  COMPLETED: 'Tamamlandı',
}

export default function RoutesPage() {
  const [selectedDate, setSelectedDate] = useState(
    new Date().toISOString().split('T')[0]
  )
  const [routes, setRoutes] = useState<Route[]>([])
  const [selectedRoute, setSelectedRoute] = useState<Route | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  // Ajan listesi (filtreleme amaçlı)
  const [agents, setAgents] = useState<Agent[]>([])
  const [selectedAgent, setSelectedAgent] = useState<string>('all')

  // Not dialog state
  const [notesDialogOpen, setNotesDialogOpen] = useState(false)
  const [notesDialogStop, setNotesDialogStop] = useState<RouteStop | null>(null)

  // Sayfa açılışında ajanları yükle
  useEffect(() => {
    fetch('/api/agents?is_active=true')
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data)) setAgents(data.filter((a: Agent) => a.role !== 'TELESALES_AGENT'))
      })
      .catch(() => {})
  }, [])

  async function enrichRouteStops(route: Route): Promise<Route> {
    const stops = route.stops as RouteStop[]
    const missingIds = stops.filter((s) => !s.business_name).map((s) => s.lead_id)
    if (missingIds.length === 0) return route

    try {
      const res = await fetch(`/api/leads?limit=50&lead_ids=${missingIds.join(',')}`)
      if (!res.ok) return route
      const data = await res.json()
      const leadsMap = new Map((data.data ?? []).map((l: Lead) => [l.id, l]))

      const enrichedStops = stops.map((s) => {
        if (s.business_name) return s
        const lead = leadsMap.get(s.lead_id) as Lead | undefined
        if (!lead) return s
        return { ...s, business_name: lead.business_name, phone: lead.phone ?? s.phone }
      })

      return { ...route, stops: enrichedStops }
    } catch {
      return route
    }
  }

  async function loadRoutes() {
    setIsLoading(true)
    try {
      const params = new URLSearchParams({ route_date: selectedDate })
      if (selectedAgent !== 'all') {
        params.set('agent_id', selectedAgent)
      }
      const response = await fetch(`/api/routes?${params}`)
      if (response.ok) {
        const data: Route[] = await response.json()
        const enriched = await Promise.all(data.map(enrichRouteStops))
        setRoutes(enriched)
        if (enriched.length > 0) {
          setSelectedRoute(enriched[0])
        } else {
          setSelectedRoute(null)
        }
      }
    } finally {
      setIsLoading(false)
    }
  }

  async function updateStopStatus(leadId: string, newStatus: string) {
    if (!selectedRoute) return
    const prevRoute = selectedRoute
    const updatedStops = (selectedRoute.stops as RouteStop[]).map((s) =>
      s.lead_id === leadId ? { ...s, status: newStatus } : s
    )
    const updatedRoute = { ...selectedRoute, stops: updatedStops }
    setSelectedRoute(updatedRoute)
    setRoutes((prev) => prev.map((r) => (r.id === updatedRoute.id ? updatedRoute : r)))

    const res = await fetch(`/api/routes/${selectedRoute.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stops: updatedStops }),
    })
    if (!res.ok) {
      setSelectedRoute(prevRoute)
      setRoutes((prev) => prev.map((r) => (r.id === prevRoute.id ? prevRoute : r)))
    }
  }

  async function saveStopNotes(leadId: string, notes: string) {
    if (!selectedRoute) return
    const prevRoute = selectedRoute
    const updatedStops = (selectedRoute.stops as RouteStop[]).map((s) =>
      s.lead_id === leadId ? { ...s, notes } : s
    )
    const updatedRoute = { ...selectedRoute, stops: updatedStops }
    setSelectedRoute(updatedRoute)
    setRoutes((prev) => prev.map((r) => (r.id === updatedRoute.id ? updatedRoute : r)))

    const res = await fetch(`/api/routes/${selectedRoute.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stops: updatedStops }),
    })
    if (!res.ok) {
      setSelectedRoute(prevRoute)
      setRoutes((prev) => prev.map((r) => (r.id === prevRoute.id ? prevRoute : r)))
    }
  }

  const stops = selectedRoute?.stops as RouteStop[] | undefined
  const currentAgent = agents.find((a) => a.id === selectedRoute?.agent_id)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Rota Görüntüleyici</h1>
        <p className="text-muted-foreground">
          Haftalık plan ile oluşturulan rotaları görüntüleyin (Pazartesi/Çarşamba)
        </p>
      </div>

      {/* Tarih Seçici + Getir */}
      <Card>
        <CardHeader>
          <CardTitle>Rotaları Görüntüle</CardTitle>
          <CardDescription>
            Tarih seçerek o güne ait rotaları görüntüleyin
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-end gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Tarih</label>
              <Input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
              />
            </div>

            <div className="min-w-[180px] space-y-2">
              <label className="text-sm font-medium">Ajan</label>
              <Select value={selectedAgent} onValueChange={setSelectedAgent}>
                <SelectTrigger>
                  <SelectValue placeholder="Ajan seçin" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tüm Ajanlar</SelectItem>
                  {agents.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.full_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Button variant="outline" onClick={loadRoutes} disabled={isLoading}>
              {isLoading ? 'Yükleniyor...' : 'Rotaları Getir'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Rota Listesi (birden fazla rota varsa) */}
      {routes.length > 1 && (
        <Card>
          <CardHeader>
            <CardTitle>Rotalar</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {routes.map((route) => {
                const agent = agents.find((a) => a.id === route.agent_id)
                return (
                  <Button
                    key={route.id}
                    variant={selectedRoute?.id === route.id ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setSelectedRoute(route)}
                  >
                    {agent?.full_name ?? route.agent_id.slice(0, 8)}
                  </Button>
                )
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Harita */}
      {selectedRoute && stops && stops.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
              <div>
                <CardTitle>Rota Haritası</CardTitle>
                <CardDescription>
                  {stops.length} durak &bull; {selectedRoute.total_distance_km.toFixed(1)} km &bull;
                  ~{selectedRoute.estimated_duration_min} dk
                  {currentAgent && <> &bull; {currentAgent.full_name}</>}
                </CardDescription>
              </div>
              <Badge variant={selectedRoute.is_optimized ? 'default' : 'secondary'}>
                {selectedRoute.is_optimized ? 'Optimize' : 'Optimize Edilmemiş'}
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            <RouteMap
              stops={stops.map((s) => ({
                lat: s.lat,
                lng: s.lng,
                id: s.lead_id,
              }))}
            />
          </CardContent>
        </Card>
      )}

      {/* Durak Listesi */}
      {selectedRoute && stops && stops.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
              <CardTitle>Durak Listesi</CardTitle>
              <RouteExportButtons
                stops={stops}
                routeDate={selectedRoute.route_date}
                agentName={currentAgent?.full_name}
              />
            </div>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-16">Sıra</TableHead>
                  <TableHead>İşletme</TableHead>
                  <TableHead>Telefon</TableHead>
                  <TableHead>Durum</TableHead>
                  <TableHead>Not</TableHead>
                  <TableHead>Navigasyon</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {stops.map((stop) => (
                  <TableRow key={`${stop.lead_id}-${stop.order}`}>
                    <TableCell className="font-bold">{stop.order}</TableCell>
                    <TableCell className="font-medium">
                      {stop.business_name ?? stop.lead_id.slice(0, 8) + '...'}
                    </TableCell>
                    <TableCell>
                      {stop.phone ? (
                        <a href={`tel:${stop.phone}`} className="text-blue-600 underline">
                          {stop.phone}
                        </a>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Select
                        value={stop.status}
                        onValueChange={(val) => updateStopStatus(stop.lead_id, val)}
                      >
                        <SelectTrigger className="h-8 w-[130px] md:w-[160px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {Object.entries(STOP_STATUSES).map(([key, label]) => (
                            <SelectItem key={key} value={key}>
                              {label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        {stop.notes && (
                          <span className="max-w-[120px] truncate text-xs text-muted-foreground" title={stop.notes}>
                            {stop.notes}
                          </span>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setNotesDialogStop(stop)
                            setNotesDialogOpen(true)
                          }}
                        >
                          {stop.notes ? '✎' : 'Not Ekle'}
                        </Button>
                      </div>
                    </TableCell>
                    <TableCell>
                      <a
                        href={`https://www.google.com/maps/dir/?api=1&destination=${stop.lat},${stop.lng}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-blue-600 underline"
                      >
                        Google Maps
                      </a>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Not Dialog */}
      <NotesDialog
        open={notesDialogOpen}
        onClose={() => {
          setNotesDialogOpen(false)
          setNotesDialogStop(null)
        }}
        onSave={(notes) => {
          if (notesDialogStop) {
            saveStopNotes(notesDialogStop.lead_id, notes)
          }
          setNotesDialogOpen(false)
          setNotesDialogStop(null)
        }}
        initialNotes={notesDialogStop?.notes ?? ''}
        title={notesDialogStop?.business_name ? `Not — ${notesDialogStop.business_name}` : 'Not Ekle'}
      />

      {/* Boş durum */}
      {routes.length === 0 && !isLoading && (
        <Card>
          <CardContent className="py-12">
            <p className="text-center text-muted-foreground">
              Seçilen tarih için rota bulunamadı. Yönetim panelinden haftalık plan oluşturarak rotalar otomatik oluşturulur.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
