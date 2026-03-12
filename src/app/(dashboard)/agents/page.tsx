'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { MultiSelect } from '@/components/ui/multi-select'
import { X, Settings2 } from 'lucide-react'
import type { Agent, AgentRole, District, AgentPreferences } from '@/types/database'
import { ROLE_CONFIG } from '@/lib/nav-config'
import { CATEGORIES } from '@/lib/constants'

export default function AgentsPage() {
  const [agents, setAgents] = useState<Agent[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [isCreating, setIsCreating] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<Agent | null>(null)
  const [newAgent, setNewAgent] = useState({
    full_name: '',
    email: '',
    password: '',
    phone: '',
    role: 'FIELD_AGENT' as AgentRole,
    max_daily_visits: 10,
  })

  // Tercih state'leri
  const [districts, setDistricts] = useState<District[]>([])
  const [allPreferences, setAllPreferences] = useState<AgentPreferences[]>([])
  const [prefsDialogOpen, setPrefsDialogOpen] = useState(false)
  const [prefsTarget, setPrefsTarget] = useState<Agent | null>(null)
  const [prefsDistrictIds, setPrefsDistrictIds] = useState<string[]>([])
  const [prefsCategories, setPrefsCategories] = useState<string[]>([])
  const [isSavingPrefs, setIsSavingPrefs] = useState(false)

  async function loadAgents() {
    setIsLoading(true)
    try {
      const response = await fetch('/api/agents')
      if (response.ok) {
        const data = await response.json()
        setAgents(data)
      }
    } finally {
      setIsLoading(false)
    }
  }

  async function loadPreferences() {
    try {
      const res = await fetch('/api/agents/preferences')
      if (res.ok) {
        const data = await res.json()
        if (Array.isArray(data)) setAllPreferences(data)
      }
    } catch { /* ignored */ }
  }

  async function loadDistricts() {
    try {
      const res = await fetch('/api/districts')
      if (res.ok) {
        const data = await res.json()
        if (Array.isArray(data)) setDistricts(data)
      }
    } catch { /* ignored */ }
  }

  useEffect(() => {
    loadAgents()
    loadPreferences()
    loadDistricts()
  }, [])

  async function createAgent() {
    setIsCreating(true)
    setErrorMessage(null)
    try {
      const response = await fetch('/api/agents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newAgent),
      })

      if (response.ok) {
        setDialogOpen(false)
        setNewAgent({ full_name: '', email: '', password: '', phone: '', role: 'FIELD_AGENT', max_daily_visits: 10 })
        setSuccessMessage('Ajan oluşturuldu. Belirlediğiniz şifre ile giriş yapabilir.')
        setTimeout(() => setSuccessMessage(null), 5000)
        loadAgents()
      } else {
        const data = await response.json()
        setErrorMessage(data.error ?? 'Ajan oluşturulamadı')
      }
    } catch {
      setErrorMessage('Bir hata oluştu, tekrar deneyin')
    } finally {
      setIsCreating(false)
    }
  }

  async function deleteAgent() {
    if (!deleteTarget) return
    try {
      const response = await fetch(`/api/agents?id=${deleteTarget.id}`, { method: 'DELETE' })
      if (response.ok) {
        setSuccessMessage(`${deleteTarget.full_name} silindi`)
        setTimeout(() => setSuccessMessage(null), 5000)
        loadAgents()
      } else {
        const data = await response.json()
        setErrorMessage(data.error ?? 'Ajan silinemedi')
        setTimeout(() => setErrorMessage(null), 5000)
      }
    } catch {
      setErrorMessage('Bir hata oluştu, tekrar deneyin')
      setTimeout(() => setErrorMessage(null), 5000)
    } finally {
      setDeleteTarget(null)
    }
  }

  async function toggleAgentActive(agent: Agent) {
    const newIsActive = !agent.is_active
    // Optimistik güncelleme
    setAgents((prev) => prev.map((a) => a.id === agent.id ? { ...a, is_active: newIsActive } : a))

    try {
      const res = await fetch('/api/agents', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: agent.id, is_active: newIsActive }),
      })
      if (!res.ok) {
        // Geri al
        setAgents((prev) => prev.map((a) => a.id === agent.id ? { ...a, is_active: !newIsActive } : a))
        setErrorMessage('Durum güncellenemedi')
        setTimeout(() => setErrorMessage(null), 5000)
      }
    } catch {
      setAgents((prev) => prev.map((a) => a.id === agent.id ? { ...a, is_active: !newIsActive } : a))
      setErrorMessage('Bir hata oluştu')
      setTimeout(() => setErrorMessage(null), 5000)
    }
  }

  function openPrefsDialog(agent: Agent) {
    const prefs = allPreferences.find((p) => p.agent_id === agent.id)
    setPrefsTarget(agent)
    setPrefsDistrictIds(prefs?.district_ids ?? [])
    setPrefsCategories(prefs?.categories ?? [])
    setErrorMessage(null)
    setPrefsDialogOpen(true)
  }

  async function savePreferences() {
    if (!prefsTarget) return
    setIsSavingPrefs(true)
    try {
      const res = await fetch('/api/agents/preferences', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agent_id: prefsTarget.id,
          district_ids: prefsDistrictIds,
          categories: prefsCategories,
        }),
      })

      if (res.ok) {
        setPrefsDialogOpen(false)
        setSuccessMessage(`${prefsTarget.full_name} tercihleri kaydedildi`)
        setTimeout(() => setSuccessMessage(null), 5000)
        loadPreferences()
      } else {
        const data = await res.json()
        setErrorMessage(data.error ?? 'Tercihler kaydedilemedi')
        setTimeout(() => setErrorMessage(null), 5000)
      }
    } catch {
      setErrorMessage('Bir hata oluştu')
      setTimeout(() => setErrorMessage(null), 5000)
    } finally {
      setIsSavingPrefs(false)
    }
  }

  const activeAgents = agents.filter((a) => a.is_active)
  const fieldAgents = agents.filter((a) => a.role === 'FIELD_AGENT' && a.is_active)
  const teleAgents = agents.filter((a) => a.role === 'TELESALES_AGENT' && a.is_active)

  const districtOptions = districts.map((d) => ({ value: d.id, label: d.name }))
  const categoryOptions = CATEGORIES.map((c) => ({ value: c, label: c }))

  function getPreferencesSummary(agentId: string): string | null {
    const prefs = allPreferences.find((p) => p.agent_id === agentId)
    if (!prefs) return null
    const parts: string[] = []
    if (prefs.district_ids.length > 0) parts.push(`${prefs.district_ids.length} ilçe`)
    if (prefs.categories.length > 0) parts.push(`${prefs.categories.length} kategori`)
    return parts.length > 0 ? parts.join(', ') : null
  }

  return (
    <div className="space-y-6">
      {successMessage && (
        <div className="rounded-md bg-green-500/10 px-4 py-3 text-sm text-green-700 dark:text-green-400">
          {successMessage}
        </div>
      )}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Ajan Yönetimi</h1>
          <p className="text-muted-foreground">{activeAgents.length} aktif ajan</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button>Yeni Ajan Ekle</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Yeni Ajan</DialogTitle>
              <DialogDescription>Satış ekibine yeni ajan ekleyin</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Ad Soyad</label>
                <Input
                  value={newAgent.full_name}
                  onChange={(e) => setNewAgent((p) => ({ ...p, full_name: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Email</label>
                <Input
                  type="email"
                  value={newAgent.email}
                  onChange={(e) => setNewAgent((p) => ({ ...p, email: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Şifre</label>
                <Input
                  type="password"
                  placeholder="En az 6 karakter"
                  value={newAgent.password}
                  onChange={(e) => setNewAgent((p) => ({ ...p, password: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Telefon</label>
                <Input
                  value={newAgent.phone}
                  onChange={(e) => setNewAgent((p) => ({ ...p, phone: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Rol</label>
                <Select
                  value={newAgent.role}
                  onValueChange={(v) => setNewAgent((p) => ({ ...p, role: v as AgentRole }))}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="FIELD_AGENT">Saha Ajanı</SelectItem>
                    <SelectItem value="TELESALES_AGENT">Telefon Ajanı</SelectItem>
                    <SelectItem value="ADMIN">Yönetici</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Günlük Maks. Ziyaret</label>
                <Input
                  type="number"
                  value={newAgent.max_daily_visits}
                  onChange={(e) => setNewAgent((p) => ({ ...p, max_daily_visits: Number(e.target.value) }))}
                />
              </div>
              {errorMessage && (
                <div className="rounded-md bg-destructive/10 px-4 py-3 text-sm text-destructive">
                  {errorMessage}
                </div>
              )}
              <Button onClick={createAgent} className="w-full" disabled={isCreating}>
                {isCreating ? 'Oluşturuluyor...' : 'Oluştur'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* İstatistik Kartları */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold">{activeAgents.length}</div>
            <p className="text-sm text-muted-foreground">Aktif Ajan</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold">{fieldAgents.length}</div>
            <p className="text-sm text-muted-foreground">Saha Ajanı</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold">{teleAgents.length}</div>
            <p className="text-sm text-muted-foreground">Telefon Ajanı</p>
          </CardContent>
        </Card>
      </div>

      {/* Ajan Tablosu */}
      <Card>
        <CardHeader>
          <CardTitle>Ajan Listesi</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10"></TableHead>
                <TableHead>Ad Soyad</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Telefon</TableHead>
                <TableHead>Rol</TableHead>
                <TableHead>Tercihler</TableHead>
                <TableHead className="text-center">Günlük Maks.</TableHead>
                <TableHead>Durum</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {agents.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="py-8 text-center text-muted-foreground">
                    {isLoading ? 'Yükleniyor...' : 'Henüz ajan eklenmemiş'}
                  </TableCell>
                </TableRow>
              ) : (
                agents.map((agent) => {
                  const prefsSummary = getPreferencesSummary(agent.id)
                  return (
                    <TableRow key={agent.id}>
                      <TableCell className="w-10 px-2">
                        <button
                          onClick={() => setDeleteTarget(agent)}
                          className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                          title="Ajanı sil"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </TableCell>
                      <TableCell className="font-medium">{agent.full_name}</TableCell>
                      <TableCell>{agent.email}</TableCell>
                      <TableCell>{agent.phone ?? '-'}</TableCell>
                      <TableCell>
                        <Badge variant="secondary" className={ROLE_CONFIG[agent.role].className}>
                          {ROLE_CONFIG[agent.role].label}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {prefsSummary ? (
                            <Badge variant="outline" className="text-xs">{prefsSummary}</Badge>
                          ) : (
                            <span className="text-xs text-muted-foreground">Belirtilmemiş</span>
                          )}
                          <button
                            onClick={() => openPrefsDialog(agent)}
                            className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
                            title="Tercihleri düzenle"
                          >
                            <Settings2 className="h-4 w-4" />
                          </button>
                        </div>
                      </TableCell>
                      <TableCell className="text-center">{agent.max_daily_visits}</TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => toggleAgentActive(agent)}
                          className="p-0"
                        >
                          <Badge variant={agent.is_active ? 'default' : 'secondary'}>
                            {agent.is_active ? 'Aktif' : 'Pasif'}
                          </Badge>
                        </Button>
                      </TableCell>
                    </TableRow>
                  )
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Silme Onay Dialog */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Ajanı Sil</AlertDialogTitle>
            <AlertDialogDescription>
              <strong>{deleteTarget?.full_name}</strong> ajanını silmek istediğinize emin misiniz?
              Bu işlem geri alınamaz, ilişkili atamalar ve rotalar da silinecektir.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>İptal</AlertDialogCancel>
            <AlertDialogAction
              onClick={deleteAgent}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Sil
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Tercih Düzenleme Dialog */}
      <Dialog open={prefsDialogOpen} onOpenChange={setPrefsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Tercihler — {prefsTarget?.full_name}</DialogTitle>
            <DialogDescription>Ajanın çalışma ilçelerini ve sektör tercihlerini belirleyin</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">İlçeler</label>
              <MultiSelect
                options={districtOptions}
                selected={prefsDistrictIds}
                onSelectionChange={setPrefsDistrictIds}
                placeholder="İlçe seçin..."
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Kategoriler / Sektörler</label>
              <MultiSelect
                options={categoryOptions}
                selected={prefsCategories}
                onSelectionChange={setPrefsCategories}
                placeholder="Sektör seçin..."
              />
            </div>

            {errorMessage && (
              <p className="text-sm text-destructive">{errorMessage}</p>
            )}

            <Button
              onClick={savePreferences}
              className="w-full"
              disabled={isSavingPrefs || prefsDistrictIds.length === 0}
            >
              {isSavingPrefs ? 'Kaydediliyor...' : 'Kaydet'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
