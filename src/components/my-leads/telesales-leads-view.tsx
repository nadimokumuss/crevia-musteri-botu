'use client'

import { useState, useEffect, useMemo } from 'react'
import Link from 'next/link'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { PreferencesBanner } from '@/components/shared/preferences-banner'
import { NotesDialog } from '@/components/shared/notes-dialog'
import { WinxCelebration } from '@/components/shared/winx-celebration'
import { CallExportButtons } from '@/components/calls/call-export-buttons'
import { useCurrentUser } from '@/hooks/use-current-user'
import type { CallListItem } from '@/types/call'

// Instagram ikonu (SVG)
function InstagramIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
    </svg>
  )
}

interface TelesalesLeadItem {
  id: string
  business_name: string
  category: string | null
  phone: string | null
  email: string | null
  need_score: number
  recommendation: string | null
  ig_username: string | null
  scheduled_date: string
  call_list_date?: string
  call_status: string
  call_notes: string | null
  call_outcome: string | null
}

type TabKey = 'ALL' | 'PENDING' | 'COMPLETED' | 'NO_ANSWER' | 'INTERESTED' | 'NOT_INTERESTED' | 'DEMO' | 'CALLBACK' | 'WRONG_NUMBER'

const TABS: { key: TabKey; label: string }[] = [
  { key: 'ALL', label: 'Tümü' },
  { key: 'PENDING', label: 'Bekleyenler' },
  { key: 'COMPLETED', label: 'Arananlar' },
  { key: 'NO_ANSWER', label: 'Cevap Alınamayanlar' },
  { key: 'INTERESTED', label: 'İlgililer' },
  { key: 'NOT_INTERESTED', label: 'İstemeyenler' },
  { key: 'DEMO', label: 'Deneme Çekimi' },
  { key: 'CALLBACK', label: 'Geri Aranacaklar' },
  { key: 'WRONG_NUMBER', label: 'Yanlış Numara' },
]

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

export function TelesalesLeadsView() {
  const { user } = useCurrentUser()
  const [leads, setLeads] = useState<TelesalesLeadItem[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<TabKey>('ALL')
  const [notesTarget, setNotesTarget] = useState<{ leadId: string; notes: string; date: string } | null>(null)
  const [celebration, setCelebration] = useState<{ fairyId: string; statusLabel: string } | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  useEffect(() => {
    loadLeads()
  }, [])

  async function loadLeads() {
    setIsLoading(true)
    try {
      const response = await fetch('/api/my/leads/telesales')
      if (response.ok) {
        const data = await response.json()
        setLeads(data)
      }
    } finally {
      setIsLoading(false)
    }
  }

  const tabCounts = useMemo(() => {
    const counts: Record<TabKey, number> = {
      ALL: leads.length, PENDING: 0, COMPLETED: 0, NO_ANSWER: 0,
      INTERESTED: 0, NOT_INTERESTED: 0, DEMO: 0, CALLBACK: 0, WRONG_NUMBER: 0,
    }
    for (const lead of leads) {
      const status = lead.call_status as TabKey
      if (status in counts) counts[status]++
    }
    return counts
  }, [leads])

  const filteredLeads = useMemo(() => {
    if (activeTab === 'ALL') return leads
    return leads.filter((l) => l.call_status === activeTab)
  }, [leads, activeTab])

  const exportItems: CallListItem[] = useMemo(() => {
    return filteredLeads.map((lead, idx) => ({
      leadId: lead.id,
      order: idx + 1,
      businessName: lead.business_name,
      phone: lead.phone,
      needScore: lead.need_score,
      igUsername: lead.ig_username ?? undefined,
      status: (lead.call_status || 'PENDING') as CallListItem['status'],
      outcome: lead.call_outcome ?? undefined,
      notes: lead.call_notes ?? undefined,
    }))
  }, [filteredLeads])

  async function updateCallOutcome(lead: TelesalesLeadItem, status: string, outcome?: string) {
    setErrorMsg(null)
    const prevLeads = leads
    setLeads((prev) =>
      prev.map((l) =>
        l.id === lead.id && l.scheduled_date === lead.scheduled_date
          ? { ...l, call_status: status, call_outcome: outcome ?? l.call_outcome }
          : l
      )
    )

    const CELEBRATION_STATUSES = ['INTERESTED', 'DEMO', 'COMPLETED']
    if (CELEBRATION_STATUSES.includes(status) && user?.winxFairy) {
      const statusLabels: Record<string, string> = {
        INTERESTED: 'Ilgili Musteri Bulundu!',
        DEMO: 'Deneme Cekimi Alindi!',
        COMPLETED: 'Arama Tamamlandi!',
      }
      setCelebration({ fairyId: user.winxFairy, statusLabel: statusLabels[status] ?? '' })
    }

    const dateForPatch = lead.call_list_date ?? lead.scheduled_date

    try {
      const res = await fetch(`/api/my/calls/${lead.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status,
          outcome: status === 'PENDING' ? undefined : outcome,
          date: dateForPatch,
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }))
        setErrorMsg(`Güncelleme başarısız: ${err.error ?? res.status}`)
        setLeads(prevLeads)
      }
    } catch {
      setErrorMsg('Sunucuya bağlanılamadı')
      setLeads(prevLeads)
    }
  }

  async function saveNotes(leadId: string, notes: string, date: string) {
    setErrorMsg(null)
    const prevLeads = leads
    setLeads((prev) =>
      prev.map((l) => l.id === leadId ? { ...l, call_notes: notes } : l)
    )
    setNotesTarget(null)

    try {
      const res = await fetch(`/api/my/calls/${leadId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes, date }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }))
        setErrorMsg(`Not kaydedilemedi: ${err.error ?? res.status}`)
        setLeads(prevLeads)
      }
    } catch {
      setErrorMsg('Sunucuya bağlanılamadı')
      setLeads(prevLeads)
    }
  }

  const totalCount = leads.length
  const calledCount = leads.filter((l) => l.call_status !== 'PENDING').length
  const pendingCount = leads.filter((l) => l.call_status === 'PENDING').length
  const interestedCount = leads.filter((l) => l.call_status === 'INTERESTED').length

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
          <h1 className="text-2xl font-bold">Müşterilerim</h1>
          <p className="text-muted-foreground">Tüm arama atamalarınız ve sonuçları</p>
        </div>
        <CallExportButtons items={exportItems} />
      </div>

      <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
        <Card><CardContent className="pt-6"><div className="text-2xl font-bold">{totalCount}</div><p className="text-sm text-muted-foreground">Toplam</p></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="text-2xl font-bold">{calledCount}</div><p className="text-sm text-muted-foreground">Aranan</p></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="text-2xl font-bold">{pendingCount}</div><p className="text-sm text-muted-foreground">Bekleyen</p></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="text-2xl font-bold">{interestedCount}</div><p className="text-sm text-muted-foreground">İlgili</p></CardContent></Card>
      </div>

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as TabKey)}>
        <div className="overflow-x-auto">
          <TabsList className="inline-flex w-auto">
            {TABS.map((tab) => (
              <TabsTrigger key={tab.key} value={tab.key} className="whitespace-nowrap">
                {tab.label}
                {tabCounts[tab.key] > 0 && (
                  <Badge variant="secondary" className="ml-1.5 h-5 min-w-[20px] px-1.5 text-xs">
                    {tabCounts[tab.key]}
                  </Badge>
                )}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>
      </Tabs>

      <Card>
        <CardHeader>
          <CardTitle>
            {TABS.find((t) => t.key === activeTab)?.label ?? 'Tümü'} ({filteredLeads.length})
          </CardTitle>
          <CardDescription>
            Durum sütunu mevcut durumu gösterir, İşlemler sütunundan sonucu değiştirin
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 md:space-y-0">
          {/* Mobil: Kart bazlı liste */}
          <div className="md:hidden space-y-3">
            {filteredLeads.length === 0 ? (
              <p className="py-8 text-center text-muted-foreground">
                {isLoading ? 'Yükleniyor...' : 'Bu kategoride müşteri bulunamadı'}
              </p>
            ) : (
              filteredLeads.map((lead) => {
                const statusInfo = CALL_OUTCOMES.find((o) => o.value === lead.call_status)
                return (
                  <div key={`${lead.id}-${lead.scheduled_date}`} className="rounded-lg border p-3 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <Link href={`/leads/${lead.id}`} className="font-medium text-blue-600 hover:underline">
                          {lead.business_name}
                        </Link>
                        <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                          {lead.phone ? (
                            <a href={`tel:${lead.phone}`} className="text-blue-600 underline">{lead.phone}</a>
                          ) : null}
                          {lead.ig_username && (
                            <a
                              href={`https://instagram.com/${lead.ig_username}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-pink-600 hover:text-pink-700"
                              title={`@${lead.ig_username}`}
                            >
                              <InstagramIcon className="h-4 w-4" />
                            </a>
                          )}
                          {lead.category ? <span>{lead.category}</span> : null}
                          <span className="font-bold text-foreground">{lead.need_score}p</span>
                        </div>
                      </div>
                      <Badge variant="secondary" className={`shrink-0 ${statusInfo?.className ?? ''}`}>
                        {statusInfo?.label ?? lead.call_status}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-2">
                      <Select
                        value={lead.call_status}
                        onValueChange={(val) => {
                          const outcome = CALL_OUTCOMES.find((o) => o.value === val)
                          if (outcome) updateCallOutcome(lead, outcome.value, outcome.value === 'PENDING' ? undefined : outcome.label)
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
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setNotesTarget({
                          leadId: lead.id,
                          notes: lead.call_notes ?? '',
                          date: lead.call_list_date ?? lead.scheduled_date,
                        })}
                      >
                        Not
                      </Button>
                    </div>
                  </div>
                )
              })
            )}
          </div>

          {/* Masaüstü: Tablo */}
          <div className="hidden md:block">
            <table className="w-full">
              <thead>
                <tr className="border-b text-left text-sm font-medium text-muted-foreground">
                  <th className="pb-2">İşletme</th>
                  <th className="pb-2">Kategori</th>
                  <th className="pb-2">Telefon</th>
                  <th className="pb-2 text-center">IG</th>
                  <th className="pb-2 text-center">Puan</th>
                  <th className="pb-2">Durum</th>
                  <th className="pb-2">İşlemler</th>
                </tr>
              </thead>
              <tbody>
                {filteredLeads.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-muted-foreground">
                      {isLoading ? 'Yükleniyor...' : 'Bu kategoride müşteri bulunamadı'}
                    </td>
                  </tr>
                ) : (
                  filteredLeads.map((lead) => {
                    const statusInfo = CALL_OUTCOMES.find((o) => o.value === lead.call_status)
                    return (
                      <tr key={`${lead.id}-${lead.scheduled_date}`} className="border-b">
                        <td className="py-3 font-medium">
                          <Link href={`/leads/${lead.id}`} className="text-blue-600 hover:underline">
                            {lead.business_name}
                          </Link>
                        </td>
                        <td className="py-3">{lead.category ?? '-'}</td>
                        <td className="py-3">
                          {lead.phone ? (
                            <a href={`tel:${lead.phone}`} className="text-blue-600 underline">{lead.phone}</a>
                          ) : '-'}
                        </td>
                        <td className="py-3 text-center">
                          {lead.ig_username ? (
                            <a
                              href={`https://instagram.com/${lead.ig_username}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center justify-center text-pink-600 hover:text-pink-700"
                              title={`@${lead.ig_username}`}
                            >
                              <InstagramIcon className="h-5 w-5" />
                            </a>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </td>
                        <td className="py-3 text-center font-bold">{lead.need_score}</td>
                        <td className="py-3">
                          <Badge variant="secondary" className={statusInfo?.className ?? ''}>
                            {statusInfo?.label ?? lead.call_status}
                          </Badge>
                        </td>
                        <td className="py-3">
                          <div className="flex items-center gap-1">
                            <Select
                              value={lead.call_status}
                              onValueChange={(val) => {
                                const outcome = CALL_OUTCOMES.find((o) => o.value === val)
                                if (outcome) updateCallOutcome(lead, outcome.value, outcome.value === 'PENDING' ? undefined : outcome.label)
                              }}
                            >
                              <SelectTrigger className="w-[150px]">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {CALL_OUTCOMES.map((o) => (
                                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setNotesTarget({
                                leadId: lead.id,
                                notes: lead.call_notes ?? '',
                                date: lead.call_list_date ?? lead.scheduled_date,
                              })}
                            >
                              Not
                            </Button>
                          </div>
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {notesTarget && (
        <NotesDialog
          open={!!notesTarget}
          onClose={() => setNotesTarget(null)}
          onSave={(notes) => saveNotes(notesTarget.leadId, notes, notesTarget.date)}
          initialNotes={notesTarget.notes}
          title="Arama Notu"
        />
      )}

      {celebration && (
        <WinxCelebration
          fairyId={celebration.fairyId}
          statusLabel={celebration.statusLabel}
          onComplete={() => setCelebration(null)}
        />
      )}
    </div>
  )
}
