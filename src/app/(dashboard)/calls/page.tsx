'use client'

import { useEffect, useMemo, useState } from 'react'
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
import type { CallList } from '@/types/database'
import type { CallListItem } from '@/types/call'

interface Agent {
  id: string
  full_name: string
  is_active: boolean
}

function InstagramIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
    </svg>
  )
}

function InstagramLink({ username }: { username?: string | null }) {
  if (!username) {
    return <span className="text-xs text-muted-foreground">Instagram yok</span>
  }

  return (
    <a
      href={`https://instagram.com/${username}`}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 text-pink-600 hover:text-pink-700"
      title={`@${username}`}
    >
      <InstagramIcon className="h-4 w-4" />
      <span>@{username}</span>
    </a>
  )
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

  // Sayfa yüklendiğinde aktif ajanları + en son verili tarihi çek
  useEffect(() => {
    fetch('/api/agents?is_active=true&role=TELESALES_AGENT')
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data)) setAgents(data)
      })
      .catch(() => {})

    // En son arama listesi olan tarihi bul
    fetch('/api/calls')
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data) && data.length > 0) {
          setLatestDate(data[0].list_date)
        }
      })
      .catch(() => {})
  }, [])

  // Tarih veya ajan değiştiğinde otomatik yükle
  useEffect(() => {
    loadCallLists()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDate, selectedAgent])

  function changeDate(days: number) {
    const d = new Date(selectedDate + 'T00:00:00')
    d.setDate(d.getDate() + days)
    setSelectedDate(d.toISOString().split('T')[0])
  }

  async function loadCallLists() {
    setIsLoading(true)
    try {
      const params = new URLSearchParams({ list_date: selectedDate })
      if (selectedAgent !== 'all') {
        params.set('agent_id', selectedAgent)
      }
      const response = await fetch(`/api/calls?${params}`)
      if (response.ok) {
        const data = await response.json()
        setCallLists(data)
        if (data.length > 0) {
          setSelectedList(data[0])
        } else {
          setSelectedList(null)
        }
      }
    } finally {
      setIsLoading(false)
    }
  }

  async function updateCallOutcome(leadId: string, status: string, outcome?: string) {
    if (!selectedList) return

    const response = await fetch(`/api/calls/${selectedList.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lead_id: leadId, status, outcome }),
    })

    if (response.ok) {
      const updated = await response.json()
      setSelectedList(updated)
      setCallLists((prev) =>
        prev.map((cl) => (cl.id === updated.id ? updated : cl))
      )
    }
  }

  async function saveCallNotes(leadId: string, notes: string) {
    if (!selectedList) return

    const response = await fetch(`/api/calls/${selectedList.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lead_id: leadId, notes }),
    })

    if (response.ok) {
      const updated = await response.json()
      setSelectedList(updated)
      setCallLists((prev) =>
        prev.map((cl) => (cl.id === updated.id ? updated : cl))
      )
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

            <Button onClick={loadCallLists} disabled={isLoading}>
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
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={!item.igUsername}
                          onClick={() => item.igUsername && window.open(`https://instagram.com/${item.igUsername}`, '_blank', 'noopener,noreferrer')}
                        >
                          IG Aç
                        </Button>
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
