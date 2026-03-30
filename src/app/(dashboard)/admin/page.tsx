'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

interface ScrapeConfig {
  districtId: string
  category: string
  limit?: number
}

interface ScrapeStatus {
  completedJobs: number
  totalJobs: number
  failedJobs: number
}

interface DailyDistributeResult {
  status: 'COMPLETED' | 'FAILED'
  date: string
  dayType: string
  stats?: {
    totalFieldLeads: number
    totalCallLeads: number
    unassignedLeads: number
    perAgent: Array<{ agentId: string; routeCount: number; callCount: number }>
  }
  planId?: string
  errorMessage?: string
}

const DAY_TYPE_LABELS: Record<string, string> = {
  FIELD: 'SAHA',
  OFF: 'TATiL',
}

const DAY_NAME_TR: Record<number, string> = {
  0: 'Pazar',
  1: 'Pazartesi',
  2: 'Sali',
  3: 'Carsamba',
  4: 'Persembe',
  5: 'Cuma',
  6: 'Cumartesi',
}

const DAY_INDEX_TO_TYPE: Record<number, string> = {
  0: 'OFF',
  1: 'FIELD',
  2: 'FIELD',
  3: 'FIELD',
  4: 'FIELD',
  5: 'FIELD',
  6: 'OFF',
}

function getTodayInfo() {
  const istanbulOffset = 3 * 60 * 60 * 1000
  const istanbulNow = new Date(Date.now() + istanbulOffset)
  const dateStr = istanbulNow.toISOString().split('T')[0]
  const dayIndex = istanbulNow.getUTCDay()
  const dayName = DAY_NAME_TR[dayIndex] ?? ''
  const dayType = DAY_INDEX_TO_TYPE[dayIndex] ?? 'OFF'
  return { dateStr, dayName, dayType }
}

export default function AdminPage() {
  const [isScoringAll, setIsScoringAll] = useState(false)
  const [scoreResult, setScoreResult] = useState<{ scored: number; total: number } | null>(null)

  // Tarama state
  const [isScrapingActive, setIsScrapingActive] = useState(false)
  const [scrapeStatus, setScrapeStatus] = useState<ScrapeStatus | null>(null)
  const [scrapeError, setScrapeError] = useState<string | null>(null)
  const [skippedAgents, setSkippedAgents] = useState<string[]>([])
  const abortRef = useRef<AbortController | null>(null)

  // Günlük dağıtım state
  const [isDistributing, setIsDistributing] = useState(false)
  const [distributeResult, setDistributeResult] = useState<DailyDistributeResult | null>(null)
  const [distributeError, setDistributeError] = useState<string | null>(null)
  const [isResetting, setIsResetting] = useState(false)
  const [hasExistingPlan, setHasExistingPlan] = useState(false)
  const [selectedDate, setSelectedDate] = useState('')

  // Instagram zenginleştirme state
  const [isEnrichingIG, setIsEnrichingIG] = useState(false)
  const [igEnrichResult, setIgEnrichResult] = useState<{ enriched: number; remaining: number | null } | null>(null)
  const [igEnrichError, setIgEnrichError] = useState<string | null>(null)

  const todayInfo = getTodayInfo()
  const canDistribute = todayInfo.dayType !== 'OFF'

  // Sayfa yüklendiğinde mevcut günlük dağıtımı kontrol et
  useEffect(() => {
    checkExistingDailyPlan()
    return () => {
      abortRef.current?.abort()
    }
  }, [])

  async function checkExistingDailyPlan() {
    try {
      // weekly_plans tablosunda bugünün tarihiyle kayıt var mı kontrol et
      const res = await fetch('/api/weekly-plan')
      if (res.ok) {
        const data = await res.json()
        if (data && data.week_start === todayInfo.dateStr && data.status === 'COMPLETED') {
          setHasExistingPlan(true)
          setDistributeResult({
            status: 'COMPLETED',
            date: data.week_start,
            dayType: todayInfo.dayType,
            stats: data.distribution_stats,
            planId: data.id,
          })
        }
      }
    } catch { /* ignored */ }
  }

  const runScrapeJobs = useCallback(async (configs: ScrapeConfig[]) => {
    const controller = new AbortController()
    abortRef.current = controller

    let completed = 0
    let failed = 0
    const total = configs.length

    const promises = configs.map(async (config) => {
      try {
        const res = await fetch('/api/scraper', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            district_id: config.districtId,
            source_adapter: 'google-places',
            category: config.category || undefined,
            skip_instagram: true,
            limit: config.limit,
          }),
          signal: controller.signal,
        })

        if (res.ok) {
          completed++
        } else {
          failed++
        }
      } catch (err) {
        if ((err as Error).name !== 'AbortError') {
          failed++
        }
      }

      setScrapeStatus({
        completedJobs: completed + failed,
        totalJobs: total,
        failedJobs: failed,
      })
    })

    await Promise.all(promises)

    if (completed === 0) {
      setScrapeError('Tüm tarama isleri basarisiz oldu')
      return false
    }

    return true
  }, [])

  async function handleStartScrape() {
    setIsScrapingActive(true)
    setScrapeError(null)
    setScrapeStatus(null)
    setSkippedAgents([])

    try {
      const res = await fetch('/api/weekly-plan?mode=scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })

      const data = await res.json()

      if (!res.ok) {
        setScrapeError(data.error ?? 'Tarama baslatılamadı')
        return
      }

      setSkippedAgents(data.skippedAgents ?? [])
      setScrapeStatus({
        completedJobs: 0,
        totalJobs: data.totalJobs,
        failedJobs: 0,
      })

      await runScrapeJobs(data.scrapeConfigs)
    } catch {
      setScrapeError('Bir hata olustu')
    } finally {
      setIsScrapingActive(false)
    }
  }

  async function handleDistribute(force = false, date?: string) {
    setIsDistributing(true)
    setDistributeError(null)
    if (!force) setDistributeResult(null)
    setHasExistingPlan(false)

    try {
      const body: Record<string, unknown> = {}
      if (force) body.force = true
      if (date) body.date = date

      const res = await fetch('/api/daily-plan/distribute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      const data = await res.json()

      if (!res.ok) {
        if (res.status === 409 && data.planId) {
          setHasExistingPlan(true)
        }
        setDistributeError(data.error ?? 'Dagitim basarisiz')
        return
      }

      setDistributeResult(data as DailyDistributeResult)
    } catch {
      setDistributeError('Dagitim sirasinda bir hata olustu')
    } finally {
      setIsDistributing(false)
    }
  }

  async function handleResetDaily() {
    setIsResetting(true)
    setDistributeError(null)

    try {
      const dateToReset = selectedDate || todayInfo.dateStr
      const res = await fetch(`/api/daily-plan?date=${dateToReset}`, { method: 'DELETE' })
      if (res.ok) {
        setDistributeResult(null)
        setDistributeError(null)
        setHasExistingPlan(false)
      } else {
        const data = await res.json()
        setDistributeError(data.error ?? 'Sifirlama basarisiz')
      }
    } catch {
      setDistributeError('Sifirlama basarisiz')
    } finally {
      setIsResetting(false)
    }
  }

  async function handleScoreAll() {
    setIsScoringAll(true)
    setScoreResult(null)
    try {
      const response = await fetch('/api/leads/score', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      if (response.ok) {
        const data = await response.json()
        setScoreResult(data)
      }
    } finally {
      setIsScoringAll(false)
    }
  }

  async function handleEnrichInstagram() {
    setIsEnrichingIG(true)
    setIgEnrichError(null)
    setIgEnrichResult(null)

    try {
      const res = await fetch('/api/leads/enrich-instagram', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ limit: 5 }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        setIgEnrichError(err.error ?? 'Instagram zenginleştirme başarısız')
        return
      }
      const data = await res.json()
      setIgEnrichResult({
        enriched: data.enriched ?? 0,
        remaining: data.remaining ?? null,
      })
    } catch {
      setIgEnrichError('Sunucuya bağlanılamadı')
    } finally {
      setIsEnrichingIG(false)
    }
  }

  const scrapeProgress = scrapeStatus
    ? Math.round((scrapeStatus.completedJobs / Math.max(scrapeStatus.totalJobs, 1)) * 100)
    : 0

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Yönetici Paneli</h1>
        <p className="text-muted-foreground">Sistem yönetimi ve toplu islemler</p>
      </div>

      {/* Instagram Zenginleştirme - tam genişlik */}
      <Card className="border-pink-200 bg-pink-50/30">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <span>📸</span> Instagram Zenginleştirme
          </CardTitle>
          <CardDescription>
              Instagram hesabı taranmamış lead&apos;leri zenginleştir. Her çalıştırmada 5 lead işlenir, birden fazla kez çalıştırabilirsiniz.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button
            onClick={handleEnrichInstagram}
            disabled={isEnrichingIG}
            className="w-full"
            variant="secondary"
          >
            {isEnrichingIG ? 'Zenginleştiriliyor...' : 'Instagram Zenginleştir'}
          </Button>

          {igEnrichError && (
            <div className="rounded-md bg-red-50 p-3 text-sm text-red-600">
              {igEnrichError}
            </div>
          )}

          {igEnrichResult && (
            <div className="rounded-md bg-pink-100 p-3 text-sm">
              <p className="font-medium text-pink-800">Zenginleştirme tamamlandı</p>
              <div className="mt-2 flex flex-wrap gap-2">
                <Badge variant="secondary" className="bg-pink-200 text-pink-800">
                  {igEnrichResult.enriched} lead zenginleştirildi
                </Badge>
                {igEnrichResult.remaining !== null && (
                  <Badge variant="outline">
                    {igEnrichResult.remaining} lead bekliyor
                  </Badge>
                )}
              </div>
              {igEnrichResult.remaining !== null && igEnrichResult.remaining > 0 && (
                <p className="mt-2 text-xs text-muted-foreground">
                  Kalan lead&apos;ler için butona tekrar basın veya cron job bekleyin.
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Lead Tarama */}
        <Card>
          <CardHeader>
            <CardTitle>Lead Tarama</CardTitle>
            <CardDescription>
              Ajan tercihlerine göre lead havuzunu genislet. Tarama ve dagitim birbirinden bagimsizdir.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button
              onClick={handleStartScrape}
              disabled={isScrapingActive}
              className="w-full"
            >
              {isScrapingActive ? 'Tarama devam ediyor...' : 'Tarama Baslat'}
            </Button>

            {skippedAgents.length > 0 && (
              <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
                Tercihsiz ajanlar atlandi: {skippedAgents.join(', ')}
              </div>
            )}

            {scrapeError && (
              <div className="rounded-md bg-red-50 p-3 text-sm text-red-600">
                {scrapeError}
              </div>
            )}

            {scrapeStatus && (
              <div className="rounded-md bg-blue-50 p-3">
                <p className="text-sm font-medium text-blue-800">
                  Tarama: {scrapeStatus.completedJobs}/{scrapeStatus.totalJobs} tamamlandi
                  {!isScrapingActive && ' (bitti)'}
                </p>
                <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-blue-200">
                  <div
                    className="h-full rounded-full bg-blue-600 transition-all"
                    style={{ width: `${scrapeProgress}%` }}
                  />
                </div>
                {scrapeStatus.failedJobs > 0 && (
                  <p className="mt-1 text-xs text-amber-600">
                    {scrapeStatus.failedJobs} tarama basarisiz
                  </p>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Günlük Dağıtım */}
        <Card>
          <CardHeader>
            <CardTitle>Günlük Dagitim</CardTitle>
            <CardDescription>
              Belirli bir gün için lead dagitimi yap. Hafta ici günlerde aktif.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Bugünün bilgisi */}
            <div className="rounded-md bg-muted p-3">
              <p className="text-sm font-medium">
                {todayInfo.dateStr} — {todayInfo.dayName} —{' '}
                <Badge
                  variant="secondary"
                  className={
                    todayInfo.dayType === 'FIELD'
                      ? 'bg-green-100 text-green-800'
                      : ''
                  }
                >
                  {DAY_TYPE_LABELS[todayInfo.dayType] ?? todayInfo.dayType}
                </Badge>
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {todayInfo.dayType === 'FIELD' && 'FIELD ajanlar: 10 ziyaret | TELESALES: 35 arama'}
                {todayInfo.dayType === 'OFF' && 'Bugün tatil — dagitim yapilamaz'}
              </p>
            </div>

            {/* Tarih seçici */}
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium whitespace-nowrap">Tarih:</label>
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm"
              />
              {selectedDate && (
                <Button variant="ghost" size="sm" onClick={() => setSelectedDate('')}>
                  Bugün
                </Button>
              )}
            </div>

            <div className="flex gap-2">
              <Button
                onClick={() => handleDistribute(false, selectedDate || undefined)}
                disabled={!canDistribute || isDistributing}
                className="flex-1"
              >
                {isDistributing ? 'Dagitiliyor...' : selectedDate ? `${selectedDate} Dagit` : 'Bugünü Dagit'}
              </Button>
              <Button
                variant="secondary"
                onClick={() => handleDistribute(true, selectedDate || undefined)}
                disabled={isDistributing}
                size="default"
              >
                {isDistributing ? '...' : 'Yeniden Dagit'}
              </Button>
              <Button
                variant="outline"
                onClick={handleResetDaily}
                disabled={isResetting}
                size="default"
              >
                {isResetting ? '...' : 'Sifirla'}
              </Button>
            </div>

            {distributeError && (
              <div className="rounded-md bg-red-50 p-3 text-sm text-red-600">
                {distributeError}
              </div>
            )}

            {distributeResult?.status === 'COMPLETED' && distributeResult.stats && (
              <div className="rounded-md bg-green-50 p-3 text-sm">
                <p className="font-medium text-green-800">Dagitim tamamlandi!</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Badge variant="secondary" className="bg-green-100 text-green-800">
                    {distributeResult.stats.totalFieldLeads} saha ziyareti
                  </Badge>
                  <Badge variant="secondary" className="bg-blue-100 text-blue-800">
                    {distributeResult.stats.totalCallLeads} telefon aramasi
                  </Badge>
                  {distributeResult.stats.unassignedLeads > 0 && (
                    <Badge variant="outline">
                      {distributeResult.stats.unassignedLeads} atanmamis
                    </Badge>
                  )}
                </div>
              </div>
            )}

            {distributeResult?.status === 'FAILED' && (
              <div className="rounded-md bg-red-50 p-3 text-sm text-red-600">
                {distributeResult.errorMessage ?? 'Dagitim hatasi'}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Toplu Puanlama */}
        <Card>
          <CardHeader>
            <CardTitle>Toplu Lead Puanlama</CardTitle>
            <CardDescription>
              Puanlanmamis tüm lead&apos;leri Need Score algoritmasiyla puanla.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button onClick={handleScoreAll} disabled={isScoringAll} className="w-full">
              {isScoringAll ? 'Puanlaniyor...' : 'Tümünü Puanla'}
            </Button>
            {scoreResult && (
              <div className="rounded-md bg-muted p-3 text-sm">
                <p className="font-medium">Puanlama tamamlandi</p>
                <div className="mt-2 flex gap-4">
                  <Badge variant="secondary">{scoreResult.scored} puanlandi</Badge>
                  <Badge variant="outline">{scoreResult.total} toplam</Badge>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Haftalık Takvim */}
        <Card>
          <CardHeader>
            <CardTitle>Haftalik Takvim</CardTitle>
            <CardDescription>Standart calisma takvimi</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 text-sm">
              {['Pazartesi', 'Sali', 'Carsamba', 'Persembe', 'Cuma'].map((day) => (
                <div key={day} className="flex justify-between">
                  <span>{day}</span>
                  <span className="text-xs text-muted-foreground">FIELD: 10 ziyaret | TELESALES: 35 arama</span>
                </div>
              ))}
              <div className="flex justify-between">
                <span>Cumartesi / Pazar</span>
                <Badge variant="outline">Tatil</Badge>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
