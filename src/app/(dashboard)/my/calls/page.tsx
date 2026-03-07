'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
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
import { NotesDialog } from '@/components/shared/notes-dialog'
import { PreferencesBanner } from '@/components/shared/preferences-banner'
import { CallExportButtons } from '@/components/calls/call-export-buttons'
import type { CallListItem } from '@/types/call'

// Instagram ikonu (SVG)
function InstagramIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
    </svg>
  )
}

interface MyCallListData {
  id: string
  list_date: string
  items: CallListItem[]
  total_items: number
  completed_items: number
}

const CALL_OUTCOMES = [
  { value: 'PENDING', label: 'Bekliyor', className: 'bg-gray-100 text-gray-800' },
  { value: 'COMPLETED', label: 'Tamamlandı', className: 'bg-green-100 text-green-800' },
  { value: 'NO_ANSWER', label: 'Cevap Yok', className: 'bg-yellow-100 text-yellow-800' },
  { value: 'CALLBACK', label: 'Geri Ara', className: 'bg-blue-100 text-blue-800' },
  { value: 'INTERESTED', label: 'İlgili', className: 'bg-emerald-100 text-emerald-800' },
  { value: 'NOT_INTERESTED', label: 'İlgili Değil', className: 'bg-red-100 text-red-800' },
  { value: 'WRONG_NUMBER', label: 'Yanlış Numara', className: 'bg-gray-100 text-gray-800' },
  { value: 'DEMO', label: 'Deneme Çekimi', className: 'bg-purple-100 text-purple-800' },
]

export default function MyCallsPage() {
  const [callList, setCallList] = useState<MyCallListData | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [notesTarget, setNotesTarget] = useState<{ leadId: string; notes: string } | null>(null)
  const [selectedDate, setSelectedDate] = useState(() => new Date().toISOString().split('T')[0])
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  useEffect(() => {
    loadCallList()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDate])

  async function loadCallList() {
    setIsLoading(true)
    try {
      const response = await fetch(`/api/my/calls?date=${selectedDate}`)
      if (response.ok) {
        const data = await response.json() as MyCallListData | null
        setCallList(data)
      }
    } finally {
      setIsLoading(false)
    }
  }

  async function updateCallOutcome(leadId: string, status: string, outcome?: string) {
    setErrorMsg(null)
    const prev = callList
    setCallList((p) => {
      if (!p) return p
      const items = p.items.map((item) =>
        item.leadId === leadId ? { ...item, status: status as CallListItem['status'], outcome } : item
      )
      const completedItems = items.filter((i) => i.status !== 'PENDING').length
      return { ...p, items, completed_items: completedItems }
    })

    try {
      const res = await fetch(`/api/my/calls/${leadId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, outcome: status === 'PENDING' ? undefined : outcome, date: selectedDate }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }))
        setErrorMsg(`Güncelleme başarısız: ${err.error ?? res.status}`)
        setCallList(prev)
      }
    } catch {
      setErrorMsg('Sunucuya bağlanılamadı')
      setCallList(prev)
    }
  }

  async function saveNotes(leadId: string, notes: string) {
    setErrorMsg(null)
    const prev = callList
    setCallList((p) => {
      if (!p) return p
      const items = p.items.map((item) =>
        item.leadId === leadId ? { ...item, notes } : item
      )
      return { ...p, items }
    })
    setNotesTarget(null)

    try {
      const res = await fetch(`/api/my/calls/${leadId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes, date: selectedDate }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }))
        setErrorMsg(`Not kaydedilemedi: ${err.error ?? res.status}`)
        setCallList(prev)
      }
    } catch {
      setErrorMsg('Sunucuya bağlanılamadı')
      setCallList(prev)
    }
  }

  if (isLoading) {
    return <div className="py-12 text-center text-muted-foreground">Yükleniyor...</div>
  }

  const items = callList?.items ?? []
  const completionRate = callList
    ? Math.round((callList.completed_items / Math.max(callList.total_items, 1)) * 100)
    : 0

  return (
    <div className="space-y-6">
      <PreferencesBanner />

      {errorMsg && (
        <div className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-800">
          {errorMsg}
          <button className="ml-2 underline" onClick={() => setErrorMsg(null)}>Kapat</button>
        </div>
      )}

      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Telefon Aramalarım</h1>
          <p className="text-muted-foreground">
            {callList ? `${callList.list_date} tarihli arama listesi` : 'Seçili tarih için arama listesi yok'}
          </p>
        </div>
        <Input
          type="date"
          value={selectedDate}
          onChange={(e) => setSelectedDate(e.target.value)}
          className="w-full md:w-44"
        />
      </div>

      {callList && (
        <>
          <div className="grid gap-4 grid-cols-3">
            <Card><CardContent className="pt-6"><div className="text-2xl font-bold">{callList.total_items}</div><p className="text-sm text-muted-foreground">Toplam</p></CardContent></Card>
            <Card><CardContent className="pt-6"><div className="text-2xl font-bold">{callList.completed_items}</div><p className="text-sm text-muted-foreground">Tamamlanan</p></CardContent></Card>
            <Card><CardContent className="pt-6"><div className="text-2xl font-bold">%{completionRate}</div><p className="text-sm text-muted-foreground">Oran</p></CardContent></Card>
          </div>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Arama Listesi</CardTitle>
                <CardDescription>İşlemler sütunundan sonucu değiştirin</CardDescription>
              </div>
              <CallExportButtons items={items} listDate={selectedDate} />
            </CardHeader>
            <CardContent className="space-y-3 md:space-y-0">
              {/* Mobil: Kart bazlı */}
              <div className="md:hidden space-y-3">
                {items.map((item) => {
                  const statusInfo = CALL_OUTCOMES.find((o) => o.value === item.status)
                  return (
                    <div key={item.leadId} className="rounded-lg border p-3 space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-muted-foreground">{item.order}.</span>
                            <Link href={`/leads/${item.leadId}`} className="font-medium text-blue-600 hover:underline">
                              {item.businessName}
                            </Link>
                          </div>
                          <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                            {item.phone ? (
                              <a href={`tel:${item.phone}`} className="text-blue-600 underline">{item.phone}</a>
                            ) : null}
                            {item.igUsername && (
                              <a
                                href={`https://instagram.com/${item.igUsername}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-pink-600 hover:text-pink-700"
                                title={`@${item.igUsername}`}
                              >
                                <InstagramIcon className="h-4 w-4" />
                              </a>
                            )}
                            <span className="font-bold text-foreground">{item.needScore}p</span>
                          </div>
                        </div>
                        <Badge variant="secondary" className={`shrink-0 ${statusInfo?.className ?? ''}`}>
                          {statusInfo?.label ?? item.status}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-2">
                        <Select
                          value={item.status}
                          onValueChange={(val) => {
                            const outcome = CALL_OUTCOMES.find((o) => o.value === val)
                            if (outcome) updateCallOutcome(item.leadId, outcome.value, outcome.value === 'PENDING' ? undefined : outcome.label)
                          }}
                        >
                          <SelectTrigger className="flex-1">
                            <SelectValue placeholder="Seçin" />
                          </SelectTrigger>
                          <SelectContent>
                            {CALL_OUTCOMES.map((o) => (
                              <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Button variant="outline" size="sm" onClick={() => setNotesTarget({ leadId: item.leadId, notes: item.notes ?? '' })}>
                          Not
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
                      <th className="pb-2 text-center">IG</th>
                      <th className="pb-2 text-center">Puan</th>
                      <th className="pb-2">Durum</th>
                      <th className="pb-2">İşlemler</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item) => {
                      const statusInfo = CALL_OUTCOMES.find((o) => o.value === item.status)
                      return (
                        <tr key={item.leadId} className="border-b">
                          <td className="py-3 font-bold">{item.order}</td>
                          <td className="py-3 font-medium">
                            <Link href={`/leads/${item.leadId}`} className="text-blue-600 hover:underline">{item.businessName}</Link>
                          </td>
                          <td className="py-3">
                            {item.phone ? <a href={`tel:${item.phone}`} className="text-blue-600 underline">{item.phone}</a> : '-'}
                          </td>
                          <td className="py-3 text-center">
                            {item.igUsername ? (
                              <a
                                href={`https://instagram.com/${item.igUsername}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center justify-center text-pink-600 hover:text-pink-700"
                                title={`@${item.igUsername}`}
                              >
                                <InstagramIcon className="h-5 w-5" />
                              </a>
                            ) : (
                              <span className="text-muted-foreground">-</span>
                            )}
                          </td>
                          <td className="py-3 text-center font-bold">{item.needScore}</td>
                          <td className="py-3">
                            <Badge variant="secondary" className={statusInfo?.className ?? ''}>{statusInfo?.label ?? item.status}</Badge>
                          </td>
                          <td className="py-3">
                            <div className="flex items-center gap-1">
                              <Select
                                value={item.status}
                                onValueChange={(val) => {
                                  const outcome = CALL_OUTCOMES.find((o) => o.value === val)
                                  if (outcome) updateCallOutcome(item.leadId, outcome.value, outcome.value === 'PENDING' ? undefined : outcome.label)
                                }}
                              >
                                <SelectTrigger className="w-[150px]"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                  {CALL_OUTCOMES.map((o) => (
                                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              <Button variant="outline" size="sm" onClick={() => setNotesTarget({ leadId: item.leadId, notes: item.notes ?? '' })}>
                                Not
                              </Button>
                            </div>
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

      {!callList && !isLoading && (
        <Card>
          <CardContent className="py-12">
            <p className="text-center text-muted-foreground">Seçili tarih için atanmış bir arama listesi bulunmuyor.</p>
          </CardContent>
        </Card>
      )}

      {notesTarget && (
        <NotesDialog
          open={!!notesTarget}
          onClose={() => setNotesTarget(null)}
          onSave={(notes) => saveNotes(notesTarget.leadId, notes)}
          initialNotes={notesTarget.notes}
          title="Arama Notu"
        />
      )}
    </div>
  )
}
