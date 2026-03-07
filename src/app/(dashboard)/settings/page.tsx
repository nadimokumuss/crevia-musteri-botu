'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/infra/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { MultiSelect } from '@/components/ui/multi-select'
import { ROLE_CONFIG } from '@/lib/nav-config'
import { CATEGORIES, WINX_FAIRIES } from '@/lib/constants'
import { clearUserCache } from '@/hooks/use-current-user'
import type { AgentRole, District } from '@/types/database'

interface UserProfile {
  id: string
  email: string
  full_name: string
  role: string
  agent_id: string | null
}

export default function SettingsPage() {
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [fullName, setFullName] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  // Tercihler state
  const [districts, setDistricts] = useState<District[]>([])
  const [selectedDistricts, setSelectedDistricts] = useState<string[]>([])
  const [categories, setCategories] = useState<string[]>([])
  const [isSavingPrefs, setIsSavingPrefs] = useState(false)
  const [prefsMessage, setPrefsMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  // Winx peri state
  const [selectedFairy, setSelectedFairy] = useState<string | null>(null)
  const [isSavingFairy, setIsSavingFairy] = useState(false)

  useEffect(() => {
    async function loadProfile() {
      try {
        const supabase = createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (user) {
          // Agent kaydını bul
          const { data: agent } = await supabase
            .from('agents')
            .select('id')
            .eq('user_id', user.id)
            .single()

          setProfile({
            id: user.id,
            email: user.email ?? '',
            full_name: user.user_metadata?.full_name ?? '',
            role: user.user_metadata?.role ?? 'FIELD_AGENT',
            agent_id: agent?.id ?? null,
          })
          setFullName(user.user_metadata?.full_name ?? '')
          setSelectedFairy(user.user_metadata?.winx_fairy ?? null)

          // Tercihler ve ilçeleri yükle
          if (agent?.id) {
            loadPreferences(agent.id)
          }
        }
      } finally {
        setIsLoading(false)
      }
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

    loadProfile()
    loadDistricts()
  }, [])

  async function loadPreferences(agentId: string) {
    try {
      const res = await fetch(`/api/agents/preferences?agent_id=${agentId}`)
      if (res.ok) {
        const data = await res.json()
        setSelectedDistricts(data.district_ids ?? [])
        setCategories(data.categories ?? [])
      }
    } catch { /* ignored */ }
  }

  async function handleSave() {
    setIsSaving(true)
    setMessage(null)

    try {
      const supabase = createClient()
      const { error } = await supabase.auth.updateUser({
        data: { full_name: fullName },
      })

      if (error) {
        setMessage({ type: 'error', text: error.message })
        return
      }

      setProfile((p) => p ? { ...p, full_name: fullName } : p)
      setMessage({ type: 'success', text: 'Profil güncellendi' })
    } finally {
      setIsSaving(false)
    }
  }

  async function handlePasswordChange() {
    setMessage(null)
    const supabase = createClient()
    const { error } = await supabase.auth.resetPasswordForEmail(
      profile?.email ?? '',
      { redirectTo: `${window.location.origin}/login` }
    )

    if (error) {
      setMessage({ type: 'error', text: error.message })
    } else {
      setMessage({ type: 'success', text: 'Şifre sıfırlama maili gönderildi' })
    }
  }

  async function handleSavePreferences() {
    if (!profile?.agent_id) return
    setIsSavingPrefs(true)
    setPrefsMessage(null)

    try {
      const res = await fetch('/api/agents/preferences', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agent_id: profile.agent_id,
          district_ids: selectedDistricts,
          categories,
        }),
      })

      if (res.ok) {
        setPrefsMessage({ type: 'success', text: 'Tercihler kaydedildi' })
      } else {
        const data = await res.json()
        setPrefsMessage({ type: 'error', text: data.error ?? 'Tercihler kaydedilemedi' })
      }
    } catch {
      setPrefsMessage({ type: 'error', text: 'Bir hata oluştu' })
    } finally {
      setIsSavingPrefs(false)
    }
  }

  async function handleSelectFairy(fairyId: string | null) {
    setIsSavingFairy(true)
    try {
      const supabase = createClient()
      await supabase.auth.updateUser({
        data: { winx_fairy: fairyId },
      })
      setSelectedFairy(fairyId)
      clearUserCache()
    } finally {
      setIsSavingFairy(false)
    }
  }

  if (isLoading) {
    return <div className="py-12 text-center text-muted-foreground">Yükleniyor...</div>
  }

  const districtOptions = districts.map((d) => ({ value: d.id, label: d.name }))
  const categoryOptions = CATEGORIES.map((c) => ({ value: c, label: c }))

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Ayarlar</h1>
        <p className="text-muted-foreground">Profil ve hesap ayarlarınız</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Profil Bilgileri</CardTitle>
          <CardDescription>Kişisel bilgilerinizi güncelleyin</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Email</label>
            <Input value={profile?.email ?? ''} disabled />
            <p className="text-xs text-muted-foreground">Email adresi değiştirilemez</p>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Ad Soyad</label>
            <Input
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Rol</label>
            <div>
              <Badge
                variant="secondary"
                className={ROLE_CONFIG[profile?.role as AgentRole]?.className}
              >
                {ROLE_CONFIG[profile?.role as AgentRole]?.label ?? profile?.role}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground">Rol yalnızca yönetici tarafından değiştirilebilir</p>
          </div>

          {message && (
            <p className={`rounded-md p-3 text-sm ${
              message.type === 'success'
                ? 'bg-green-50 text-green-600'
                : 'bg-red-50 text-red-600'
            }`}>
              {message.text}
            </p>
          )}

          <Button onClick={handleSave} disabled={isSaving || !fullName}>
            {isSaving ? 'Kaydediliyor...' : 'Kaydet'}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Güvenlik</CardTitle>
          <CardDescription>Şifre ve güvenlik ayarları</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Şifrenizi sıfırlamak için email adresinize bir bağlantı göndeririz.
          </p>
          <Button variant="outline" onClick={handlePasswordChange}>
            Şifre Sıfırlama Maili Gönder
          </Button>
        </CardContent>
      </Card>

      {/* Winx Perim - sadece TELESALES_AGENT */}
      {profile?.role === 'TELESALES_AGENT' && (
        <Card>
          <CardHeader>
            <CardTitle>Winx Perim</CardTitle>
            <CardDescription>Seni en iyi temsil eden periyi sec</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
              {WINX_FAIRIES.map((fairy) => (
                <button
                  key={fairy.id}
                  disabled={isSavingFairy}
                  onClick={() => handleSelectFairy(fairy.id)}
                  className={`flex flex-col items-center gap-1 rounded-lg border-2 p-4 transition-all hover:scale-105 ${
                    selectedFairy === fairy.id
                      ? 'border-current shadow-lg'
                      : 'border-transparent bg-muted/50 hover:bg-muted'
                  }`}
                  style={
                    selectedFairy === fairy.id
                      ? { borderColor: fairy.color, color: fairy.color }
                      : undefined
                  }
                >
                  <img src={fairy.image} alt={fairy.name} className="h-20 w-20 rounded-full object-cover" />
                  <span className="text-sm font-bold" style={{ color: selectedFairy === fairy.id ? fairy.color : undefined }}>
                    {fairy.name}
                  </span>
                  <span className="text-xs text-muted-foreground">{fairy.power}</span>
                </button>
              ))}
            </div>
            {selectedFairy && (
              <Button
                variant="outline"
                size="sm"
                disabled={isSavingFairy}
                onClick={() => handleSelectFairy(null)}
              >
                Secimi Kaldir
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {/* Çalışma Tercihleri */}
      {profile?.agent_id && (
        <Card>
          <CardHeader>
            <CardTitle>Çalışma Tercihleri</CardTitle>
            <CardDescription>
              Haftalık plan oluşturulurken hangi ilçe ve sektörlerde çalışmak istediğinizi belirleyin
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">İlçeler</label>
              <MultiSelect
                options={districtOptions}
                selected={selectedDistricts}
                onSelectionChange={setSelectedDistricts}
                placeholder="İlçe seçin..."
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Kategoriler / Sektörler</label>
              <MultiSelect
                options={categoryOptions}
                selected={categories}
                onSelectionChange={setCategories}
                placeholder="Sektör seçin..."
              />
            </div>

            {prefsMessage && (
              <p className={`rounded-md p-3 text-sm ${
                prefsMessage.type === 'success'
                  ? 'bg-green-50 text-green-600'
                  : 'bg-red-50 text-red-600'
              }`}>
                {prefsMessage.text}
              </p>
            )}

            <Button
              onClick={handleSavePreferences}
              disabled={isSavingPrefs || selectedDistricts.length === 0}
            >
              {isSavingPrefs ? 'Kaydediliyor...' : 'Tercihleri Kaydet'}
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
