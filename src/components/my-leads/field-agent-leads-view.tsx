'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { PreferencesBanner } from '@/components/shared/preferences-banner'
import { NotesDialog } from '@/components/shared/notes-dialog'
import type { Lead, AssignmentStatus } from '@/types/database'

interface AssignedLead extends Lead {
  assignment_id: string
  assignment_status: AssignmentStatus
  assignment_type: string
  scheduled_date: string
}

const STATUS_OPTIONS = [
  { value: 'PENDING', label: 'Bekliyor', className: 'bg-gray-100 text-gray-800' },
  { value: 'IN_PROGRESS', label: 'Devam Ediyor', className: 'bg-blue-100 text-blue-800' },
  { value: 'COMPLETED', label: 'Tamamlandı', className: 'bg-green-100 text-green-800' },
  { value: 'CANCELLED', label: 'İptal', className: 'bg-red-100 text-red-800' },
  { value: 'NO_SHOW', label: 'Gelmedi', className: 'bg-yellow-100 text-yellow-800' },
]

export function FieldAgentLeadsView() {
  const [leads, setLeads] = useState<AssignedLead[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [notesTarget, setNotesTarget] = useState<{ assignmentId: string; leadId: string; notes: string } | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  const loadLeads = useCallback(async () => {
    setIsLoading(true)
    try {
      const params = new URLSearchParams()
      if (statusFilter !== 'all') params.set('status', statusFilter)
      const response = await fetch(`/api/my/leads?${params}`)
      if (response.ok) {
        const data = await response.json()
        setLeads(data)
      }
    } finally {
      setIsLoading(false)
    }
  }, [statusFilter])

  useEffect(() => {
    loadLeads()
  }, [loadLeads])

  async function updateStatus(lead: AssignedLead, newStatus: string) {
    setErrorMsg(null)
    if (!lead.assignment_id) {
      setErrorMsg('Atama ID bulunamadı — sayfayı yenileyin')
      return
    }

    const prevLeads = leads
    setLeads((prev) =>
      prev.map((l) =>
        l.assignment_id === lead.assignment_id
          ? { ...l, assignment_status: newStatus as AssignmentStatus }
          : l
      )
    )

    try {
      const res = await fetch(`/api/assignments?id=${lead.assignment_id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
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

  async function saveNotes(assignmentId: string, _leadId: string, notes: string) {
    setNotesTarget(null)

    const res = await fetch(`/api/assignments?id=${assignmentId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ notes }),
    })

    if (res.ok) {
      setLeads((prev) =>
        prev.map((l) =>
          l.assignment_id === assignmentId ? { ...l, notes } : l
        )
      )
    }
  }

  const totalAssigned = leads.length
  const completedCount = leads.filter((l) => l.assignment_status === 'COMPLETED').length
  const pendingCount = leads.filter((l) => l.assignment_status === 'PENDING').length

  return (
    <div className="space-y-6">
      <PreferencesBanner />

      {errorMsg && (
        <div className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-800">
          {errorMsg}
          <button className="ml-2 underline" onClick={() => setErrorMsg(null)}>Kapat</button>
        </div>
      )}

      <div>
        <h1 className="text-2xl font-bold">Müşterilerim</h1>
        <p className="text-muted-foreground">Size atanmış müşterilerin listesi</p>
      </div>

      <div className="grid gap-4 grid-cols-3">
        <Card><CardContent className="pt-6"><div className="text-2xl font-bold">{totalAssigned}</div><p className="text-sm text-muted-foreground">Toplam</p></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="text-2xl font-bold">{completedCount}</div><p className="text-sm text-muted-foreground">Tamamlanan</p></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="text-2xl font-bold">{pendingCount}</div><p className="text-sm text-muted-foreground">Bekleyen</p></CardContent></Card>
      </div>

      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-wrap items-end gap-4">
            <div className="min-w-[160px] space-y-2">
              <label className="text-sm font-medium">Durum Filtresi</label>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tümü</SelectItem>
                  <SelectItem value="PENDING">Bekliyor</SelectItem>
                  <SelectItem value="IN_PROGRESS">Devam Ediyor</SelectItem>
                  <SelectItem value="COMPLETED">Tamamlandı</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6 space-y-3 md:space-y-0">
          {/* Mobil: Kart bazlı */}
          <div className="md:hidden space-y-3">
            {leads.length === 0 ? (
              <p className="py-8 text-center text-muted-foreground">
                {isLoading ? 'Yükleniyor...' : 'Atanmış müşteri bulunamadı'}
              </p>
            ) : (
              leads.map((lead, idx) => {
                const statusInfo = STATUS_OPTIONS.find((s) => s.value === lead.assignment_status)
                return (
                  <div key={`${lead.id}-${lead.scheduled_date}-${idx}`} className="rounded-lg border p-3 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <Link href={`/leads/${lead.id}`} className="font-medium text-blue-600 hover:underline">
                          {lead.business_name}
                        </Link>
                        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                          {lead.phone ? (
                            <a href={`tel:${lead.phone}`} className="text-blue-600 underline">{lead.phone}</a>
                          ) : null}
                          {lead.category ? <span>{lead.category}</span> : null}
                          <Badge variant="outline" className="text-[10px] px-1 py-0">
                            {lead.assignment_type === 'VISIT' ? 'Ziyaret' : 'Arama'}
                          </Badge>
                          <span className="font-bold text-foreground">{lead.need_score}p</span>
                        </div>
                      </div>
                      <Badge variant="secondary" className={`shrink-0 ${statusInfo?.className ?? ''}`}>
                        {statusInfo?.label ?? lead.assignment_status}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-2">
                      <Select
                        value={lead.assignment_status}
                        onValueChange={(val) => updateStatus(lead, val)}
                      >
                        <SelectTrigger className="flex-1">
                          <SelectValue placeholder="Seçin" />
                        </SelectTrigger>
                        <SelectContent>
                          {STATUS_OPTIONS.map((s) => (
                            <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setNotesTarget({
                          assignmentId: lead.assignment_id,
                          leadId: lead.id,
                          notes: (lead as unknown as Record<string, string>).notes ?? '',
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
                  <th className="pb-2">Tip</th>
                  <th className="pb-2">Tarih</th>
                  <th className="pb-2">Durum</th>
                  <th className="pb-2">İşlemler</th>
                  <th className="pb-2 text-center">Puan</th>
                </tr>
              </thead>
              <tbody>
                {leads.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-8 text-center text-muted-foreground">
                      {isLoading ? 'Yükleniyor...' : 'Atanmış müşteri bulunamadı'}
                    </td>
                  </tr>
                ) : (
                  leads.map((lead, idx) => {
                    const statusInfo = STATUS_OPTIONS.find((s) => s.value === lead.assignment_status)
                    return (
                      <tr key={`${lead.id}-${lead.scheduled_date}-${idx}`} className="border-b">
                        <td className="py-3 font-medium">
                          <Link href={`/leads/${lead.id}`} className="text-blue-600 hover:underline">{lead.business_name}</Link>
                        </td>
                        <td className="py-3">{lead.category ?? '-'}</td>
                        <td className="py-3">
                          {lead.phone ? <a href={`tel:${lead.phone}`} className="text-blue-600 underline">{lead.phone}</a> : '-'}
                        </td>
                        <td className="py-3">
                          <Badge variant="outline">{lead.assignment_type === 'VISIT' ? 'Ziyaret' : 'Arama'}</Badge>
                        </td>
                        <td className="py-3 text-sm">{lead.scheduled_date}</td>
                        <td className="py-3">
                          <Badge variant="secondary" className={statusInfo?.className ?? ''}>
                            {statusInfo?.label ?? lead.assignment_status}
                          </Badge>
                        </td>
                        <td className="py-3">
                          <div className="flex items-center gap-1">
                            <Select value={lead.assignment_status} onValueChange={(val) => updateStatus(lead, val)}>
                              <SelectTrigger className="w-[150px]"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                {STATUS_OPTIONS.map((s) => (
                                  <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setNotesTarget({
                                assignmentId: lead.assignment_id,
                                leadId: lead.id,
                                notes: (lead as unknown as Record<string, string>).notes ?? '',
                              })}
                            >
                              Not
                            </Button>
                          </div>
                        </td>
                        <td className="py-3 text-center font-bold">{lead.need_score}</td>
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
          onSave={(notes) => saveNotes(notesTarget.assignmentId, notesTarget.leadId, notes)}
          initialNotes={notesTarget.notes}
          title="Ziyaret Notu"
        />
      )}
    </div>
  )
}
