'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
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
import { NotesDialog } from '@/components/shared/notes-dialog'
import { CallExportButtons } from '@/components/calls/call-export-buttons'
import { getTodayDateInIstanbul } from '@/lib/date-utils'
import { getInstagramProfileUrl } from '@/lib/instagram-utils'
import { InstagramLink } from '@/components/ui/instagram-link'
import type { CallList } from '@/types/database'
import type { CallListItem } from '@/types/call'

interface Agent {
  id: string
  full_name: string
  is_active: boolean
}

async function readErrorMessage(response: Response, fallbackMessage: string): Promise<string> {
  const data = await response.json().catch(() => null)

  if (
    data &&
    typeof data === 'object' &&
    'error' in data &&
    typeof data.error === 'string'
  ) {
    return data.error
  }

  return fallbackMessage
}

export default function CallsPage() {
  const [selectedDate, setSelectedDate] = useState(
    getTodayDateInIstanbul()
  )
  const [agents, setAgents] = useState<Agent[]>([])
  const [selectedAgent, setSelectedAgent] = useState<string>('all')
  const [callLists, setCallLists] = useState<CallList[]>([])
  const [selectedList, setSelectedList] = useState<CallList | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [latestDate, setLatestDate] = useState<string | null>(null)
  const [notesDialogOpen, setNotesDialogOpen] = useState(false)
  const [notesDialogItem, setNotesDialogItem] = useState<CallListItem | null>(null)
  const [prioritizeInstagram, setPrioritizeInstagram] = useState(true)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const callListsRequestRef = useRef(0)

  // Sayfa yüklendiğinde aktif ajanları + en son verili tarihi çek
  useEffect(() => {
    let cancelled = false

    async function loadPageMeta() {
      const [agentsResult, latestDateResult] = await Promise.allSettled([
        fetch('/api/agents?is_active=true&role=TELESALES_AGENT'),
        fetch('/api/calls'),
      ])

      const errors: string[] = []

      if (agentsResult.status === 'fulfilled') {
        if (agentsResult.value.ok) {
          const data = await agentsResult.value.json()
          if (!cancelled && Array.isArray(data)) {
            setAgents(data)
          }
        } else {
          errors.push(await readErrorMessage(agentsResult.value, 'Aktif ajanlar alınamadı.'))
        }
      } else {
        errors.push('Aktif ajanlar alınamadı.')
      }

      if (latestDateResult.status === 'fulfilled') {
        if (latestDateResult.value.ok) {
          const data = await latestDateResult.value.json()
          if (!cancelled && Array.isArray(data) && data.length > 0) {
            setLatestDate(data[0].list_date)
          }
        } else {
          errors.push(await readErrorMessage(latestDateResult.value, 'Son liste tarihi alınamadı.'))
        }
      } else {
        errors.push('Son liste tarihi alınamadı.')
      }

      if (!cancelled) {
        setErrorMsg(errors.length > 0 ? errors.join(' ') : null)
      }
    }

    void loadPageMeta()

    return () => {
      cancelled = true
    }
  }, [])

  const loadCallLists = useCallback(async (date: string, agentId: string) => {
    const requestId = ++callListsRequestRef.current
    setIsLoading(true)
    setErrorMsg(null)
    try {
      const params = new URLSearchParams({ list_date: date })
      if (agentId !== 'all') {
        params.set('agent_id', agentId)
      }
      const response = await fetch(`/api/calls?${params}`)
      if (!response.ok) {
        const message = await readErrorMessage(
          response,
          'Arama listeleri alınamadı. Son başarılı veriler gösteriliyor.'
        )
        if (requestId === callListsRequestRef.current) {
          setErrorMsg(message)
        }
        return
      }

      const data = (await response.json()) as CallList[]

      if (requestId !== callListsRequestRef.current) {
        return
      }

      setCallLists(data)
      setSelectedList((current) => {
        if (!current) {
          return data[0] ?? null
        }

        return data.find((callList) => callList.id === current.id) ?? data[0] ?? null
      })
    } catch {
      if (requestId === callListsRequestRef.current) {
        setErrorMsg('Sunucuya bağlanılamadı. Son başarılı veriler gösteriliyor.')
      }
    } finally {
      if (requestId === callListsRequestRef.current) {
        setIsLoading(false)
      }
    }
  }, [])

  // Tarih veya ajan değiştiğinde otomatik yükle
  useEffect(() => {
    void loadCallLists(selectedDate, selectedAgent)
  }, [loadCallLists, selectedAgent, selectedDate])

  function changeDate(days: number) {
    const d = new Date(selectedDate + 'T00:00:00')
    d.setDate(d.getDate() + days)
    setSelectedDate(d.toISOString().split('T')[0])
  }

  async function updateCallOutcome(leadId: string, status: string, outcome?: string) {
    if (!selectedList) return

    setErrorMsg(null)

    try {
      const response = await fetch(`/api/calls/${selectedList.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lead_id: leadId, status, outcome }),
      })

      if (!response.ok) {
        setErrorMsg(await readErrorMessage(response, 'Arama sonucu güncellenemedi.'))
        return
      }

      const updated = await response.json()
      setSelectedList(updated)
      setCallLists((prev) =>
        prev.map((cl) => (cl.id === updated.id ? updated : cl))
      )
    } catch {
      setErrorMsg('Sunucuya bağlanılamadı.')
    }
  }

  async function saveCallNotes(leadId: string, notes: string) {
    if (!selectedList) return

    setErrorMsg(null)

    try {
      const response = await fetch(`/api/calls/${selectedList.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lead_id: leadId, notes }),
      })

      if (!response.ok) {
        setErrorMsg(await readErrorMessage(response, 'Not kaydedilemedi.'))
        return
      }

      const updated = await response.json()
      setSelectedList(updated)
      setCallLists((prev) =>
        prev.map((cl) => (cl.id === updated.id ? updated : cl))
      )
    } catch {
      setErrorMsg('Sunucuya bağlanılamadı.')
    }
  }

  const visibleItems = useMemo(() => {
    const currentItems = (selectedList?.items ?? []) as unknown as CallListItem[]

    if (!prioritizeInstagram) {
      return currentItems
    }

    return [...currentItems].sort((left, right) => {
      const leftHasInstagram = Boolean(left.igUsername)
      const rightHasInstagram = Boolean(right.igUsername)

      if (leftHasInstagram === rightHasInstagram) {
        return left.order - right.order
      }

      return leftHasInstagram ? -1 : 1
    })
  }, [selectedList?.items, prioritizeInstagram])
  const completionRate = selectedList
    ? Math.round((selectedList.completed_items / Math.max(selectedList.total_items, 1)) * 100)
    : 0

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Arama Listesi</h1>
        <p className="text-muted-foreground">
          Yönetim ekranından manuel oluşturulan telefon listeleri
        </p>
      </div>

      {errorMsg && (
        <div className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-800">
          {errorMsg}
          <button className="ml-2 underline" onClick={() => setErrorMsg(null)}>Kapat</button>
        </div>
      )}

      {/* Tarih + Ajan Seçici */}
      <Card>
        <CardHeader>
          <CardTitle>Arama Listesi Görüntüle</CardTitle>
          <CardDescription>Tarih ve ajan seçerek listeleri görüntüleyin</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-end gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Tarih</label>
              <div className="flex items-center gap-1">
                <Button variant="outline" size="icon" onClick={() => changeDate(-1)} title="Önceki gün">
                  &larr;
                </Button>
                <Input
                  type="date"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  className="w-auto"
                />
                <Button variant="outline" size="icon" onClick={() => changeDate(1)} title="Sonraki gün">
                  &rarr;
                </Button>
              </div>
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

            <Button onClick={() => void loadCallLists(selectedDate, selectedAgent)} disabled={isLoading}>
              {isLoading ? 'Yükleniyor...' : 'Yenile'}
            </Button>

            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              <input
                type="checkbox"
                checked={prioritizeInstagram}
                onChange={(event) => setPrioritizeInstagram(event.target.checked)}
                className="h-4 w-4 rounded border-input"
              />
              Instagram hesabı olanları üste al
            </label>
          </div>
        </CardContent>
      </Card>

      {/* Birden fazla liste varsa seçici */}
      {callLists.length > 1 && (
        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-wrap gap-2">
              {callLists.map((cl) => {
                const agentName = agents.find((a) => a.id === cl.agent_id)?.full_name ?? cl.agent_id
                return (
                  <Button
                    key={cl.id}
                    variant={selectedList?.id === cl.id ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setSelectedList(cl)}
                  >
                    {agentName} ({cl.total_items} arama)
                  </Button>
                )
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* İstatistikler */}
      {selectedList && (
        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold">{selectedList.total_items}</div>
              <p className="text-sm text-muted-foreground">Toplam Arama</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold">{selectedList.completed_items}</div>
              <p className="text-sm text-muted-foreground">Tamamlanan</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold">%{completionRate}</div>
              <p className="text-sm text-muted-foreground">Tamamlanma Oranı</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Arama Tablosu */}
      {selectedList && visibleItems.length > 0 && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Arama Detayları</CardTitle>
            <CallExportButtons
              items={visibleItems}
              listDate={selectedDate}
              agentName={agents.find((a) => a.id === selectedList.agent_id)?.full_name}
            />
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-16">Sıra</TableHead>
                  <TableHead>İşletme</TableHead>
                  <TableHead>Telefon / Instagram</TableHead>
                  <TableHead className="text-center">Puan</TableHead>
                  <TableHead>Durum</TableHead>
                  <TableHead>Not</TableHead>
                  <TableHead>İşlem</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visibleItems.map((item) => (
                  <TableRow key={item.leadId}>
                    <TableCell className="font-bold">{item.order}</TableCell>
                    <TableCell className="font-medium">{item.businessName}</TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-1">
                        {item.phone ? (
                          <a href={`tel:${item.phone}`} className="text-blue-600 underline">
                            {item.phone}
                          </a>
                        ) : (
                          <span className="text-muted-foreground">Telefon yok</span>
                        )}
                        <InstagramLink username={item.igUsername} />
                      </div>
                    </TableCell>
                    <TableCell className="text-center font-bold">{item.needScore}</TableCell>
                    <TableCell>
                      <CallStatusBadge status={item.status} />
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setNotesDialogItem(item)
                          setNotesDialogOpen(true)
                        }}
                      >
                        {item.notes ? 'Notu Düzenle' : 'Not Ekle'}
                      </Button>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-2">
                        {getInstagramProfileUrl(item.igUsername) ? (
                          <Button asChild size="sm" variant="outline">
                            <a
                              href={getInstagramProfileUrl(item.igUsername)!}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              IG Aç
                            </a>
                          </Button>
                        ) : (
                          <Button size="sm" variant="outline" disabled>
                            IG Aç
                          </Button>
                        )}
                        {item.status === 'PENDING' ? (
                          <>
                            <Button
                              size="sm"
                              variant="default"
                              onClick={() => updateCallOutcome(item.leadId, 'COMPLETED', 'Görüşüldü')}
                            >
                              Tamamla
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => updateCallOutcome(item.leadId, 'NO_ANSWER')}
                            >
                              Cevap Yok
                            </Button>
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={() => updateCallOutcome(item.leadId, 'CALLBACK')}
                            >
                              Geri Ara
                            </Button>
                          </>
                        ) : (
                          <span className="self-center text-sm text-muted-foreground">
                            {item.outcome ?? '-'}
                          </span>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Boş durum */}
      {callLists.length === 0 && !isLoading && (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">
              {selectedDate} tarihi için arama listesi bulunamadı.
            </p>
            {latestDate && latestDate !== selectedDate && (
              <Button
                variant="link"
                className="mt-2"
                onClick={() => setSelectedDate(latestDate)}
              >
                Son verili tarih: {latestDate} &rarr;
              </Button>
            )}
            {!latestDate && (
              <p className="mt-2 text-sm text-muted-foreground">
                Henüz arama listesi oluşturulmamış. Yönetim ekranından manuel liste üretebilirsiniz.
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Not Dialog */}
      <NotesDialog
        open={notesDialogOpen}
        onClose={() => {
          setNotesDialogOpen(false)
          setNotesDialogItem(null)
        }}
        onSave={(notes) => {
          if (notesDialogItem) {
            saveCallNotes(notesDialogItem.leadId, notes)
          }
          setNotesDialogOpen(false)
          setNotesDialogItem(null)
        }}
        initialNotes={notesDialogItem?.notes ?? ''}
        title={notesDialogItem?.businessName ? `Not — ${notesDialogItem.businessName}` : 'Not Ekle'}
      />
    </div>
  )
}

function CallStatusBadge({ status }: { status: string }) {
  const config: Record<string, { label: string; className: string }> = {
    PENDING: { label: 'Bekliyor', className: 'bg-gray-100 text-gray-800' },
    COMPLETED: { label: 'Tamamlandı', className: 'bg-green-100 text-green-800' },
    NO_ANSWER: { label: 'Cevap Yok', className: 'bg-yellow-100 text-yellow-800' },
    CALLBACK: { label: 'Geri Aranacak', className: 'bg-blue-100 text-blue-800' },
    INTERESTED: { label: 'İlgili', className: 'bg-emerald-100 text-emerald-800' },
    NOT_INTERESTED: { label: 'İlgili Değil', className: 'bg-red-100 text-red-800' },
    WRONG_NUMBER: { label: 'Yanlış Numara', className: 'bg-gray-100 text-gray-800' },
    DEMO: { label: 'Deneme Çekimi', className: 'bg-purple-100 text-purple-800' },
  }

  const c = config[status] ?? { label: status, className: '' }

  return (
    <Badge variant="secondary" className={c.className}>
      {c.label}
    </Badge>
  )
}
