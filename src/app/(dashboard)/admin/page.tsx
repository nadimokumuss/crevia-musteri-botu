'use client'

import { useEffect, useMemo, useState } from 'react'
import { getDayType } from '@/core/scheduler/weekly-planner'
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
import { CATEGORIES } from '@/lib/constants'
import { formatLongDateInIstanbul, getTodayDateInIstanbul, parseIstanbulDate } from '@/lib/date-utils'
import { INSTAGRAM_DISCOVERY_SOURCE_LABELS } from '@/lib/instagram-source'
import type { Agent, District, ScrapeJob } from '@/types/database'

type ScrapeSource = 'google-places' | 'apify' | 'instagram'

interface ScrapeSummary {
  jobId: string
  leadsFound: number
  leadsNew: number
  leadsUpdated: number
}

interface ManualCallListSummary {
  id: string
  total_items: number
  assignedExcluded?: number
  preferencesApplied?: boolean
}

interface EnrichedInstagramMatch {
  id: string
  businessName: string
  username: string
  source: 'WEBSITE_URL' | 'WEBSITE_HTML' | 'CANDIDATE_VERIFIED'
}

interface InstagramEnrichmentState {
  enriched: number
  processed: number
  backfilled: number
  unmatched: number
  failed: number
  remaining: number | null
  completedAll: boolean
  batches: number
  sources: {
    website_url: number
    website_html: number
    candidate_verified: number
  }
  matches: EnrichedInstagramMatch[]
}

const INSTAGRAM_BATCH_SIZE = 5
const INSTAGRAM_MAX_BATCHES = 40

interface AuditBatchResult {
  eligible: number
  enriched: number
  synthesized: number
  skipped: number
  errors: Array<{ leadId: string; stage: string; message: string }>
  estimatedCostUsd: { gbp: number; llm: number; total: number }
}

const DAY_TYPE_LABELS: Record<string, string> = {
  REMOTE: 'Arama Günü',
  OFF: 'Tatil',
}

const JOB_STATUS_LABELS: Record<string, string> = {
  PENDING: 'Bekliyor',
  RUNNING: 'Çalışıyor',
  COMPLETED: 'Tamamlandı',
  FAILED: 'Başarısız',
}

const JOB_STATUS_CLASSES: Record<string, string> = {
  PENDING: 'bg-slate-100 text-slate-800',
  RUNNING: 'bg-blue-100 text-blue-800',
  COMPLETED: 'bg-green-100 text-green-800',
  FAILED: 'bg-red-100 text-red-800',
}

export default function AdminPage() {
  const [districts, setDistricts] = useState<District[]>([])
  const [agents, setAgents] = useState<Agent[]>([])
  const [scrapeJobs, setScrapeJobs] = useState<ScrapeJob[]>([])

  const [isLoadingBaseData, setIsLoadingBaseData] = useState(true)
  const [pageError, setPageError] = useState<string | null>(null)

  const [scrapeDistrictId, setScrapeDistrictId] = useState('')
  const [scrapeSource, setScrapeSource] = useState<ScrapeSource>('google-places')
  const [scrapeCategory, setScrapeCategory] = useState('all')
  const [scrapeLimit, setScrapeLimit] = useState('40')
  const [skipInstagram, setSkipInstagram] = useState(true)
  const [isScraping, setIsScraping] = useState(false)
  const [scrapeError, setScrapeError] = useState<string | null>(null)
  const [scrapeResult, setScrapeResult] = useState<ScrapeSummary | null>(null)

  const [callAgentId, setCallAgentId] = useState('')
  const [callListDate, setCallListDate] = useState(() => getTodayDateInIstanbul())
  const [callMaxItems, setCallMaxItems] = useState('20')
  const [callMinScore, setCallMinScore] = useState('20')
  const [isCreatingCallList, setIsCreatingCallList] = useState(false)
  const [callListError, setCallListError] = useState<string | null>(null)
  const [callListResult, setCallListResult] = useState<ManualCallListSummary | null>(null)

  const [isScoringAll, setIsScoringAll] = useState(false)
  const [scoreResult, setScoreResult] = useState<{ scored: number; total: number } | null>(null)

  const [isEnrichingInstagram, setIsEnrichingInstagram] = useState(false)
  const [instagramError, setInstagramError] = useState<string | null>(null)
  const [instagramResult, setInstagramResult] = useState<InstagramEnrichmentState | null>(null)
  const [auditMinScore, setAuditMinScore] = useState('40')
  const [auditLimit, setAuditLimit] = useState('10')
  const [isAuditing, setIsAuditing] = useState(false)
  const [auditError, setAuditError] = useState<string | null>(null)
  const [auditResult, setAuditResult] = useState<AuditBatchResult | null>(null)

  const todayDate = getTodayDateInIstanbul()
  const dayType = getDayType(parseIstanbulDate(todayDate))
  const activeTeleAgents = useMemo(
    () => agents.filter((agent) => agent.role === 'TELESALES_AGENT' && agent.is_active),
    [agents]
  )

  useEffect(() => {
    void loadDashboardData()
  }, [])

  async function loadDashboardData() {
    setIsLoadingBaseData(true)
    setPageError(null)

    try {
      const [districtsRes, agentsRes, jobsRes] = await Promise.all([
        fetch('/api/districts?is_active=true'),
        fetch('/api/agents?is_active=true&role=TELESALES_AGENT'),
        fetch('/api/scraper'),
      ])

      const [districtsData, agentsData, jobsData] = await Promise.all([
        districtsRes.json(),
        agentsRes.json(),
        jobsRes.json(),
      ])

      if (!districtsRes.ok) {
        throw new Error(districtsData.error ?? 'İlçeler yüklenemedi')
      }
      if (!agentsRes.ok) {
        throw new Error(agentsData.error ?? 'Telefon ajanları yüklenemedi')
      }
      if (!jobsRes.ok) {
        throw new Error(jobsData.error ?? 'Tarama işleri yüklenemedi')
      }

      const nextDistricts = Array.isArray(districtsData) ? (districtsData as District[]) : []
      const nextAgents = Array.isArray(agentsData) ? (agentsData as Agent[]) : []
      const nextJobs = Array.isArray(jobsData) ? (jobsData as ScrapeJob[]) : []

      setDistricts(nextDistricts)
      setAgents(nextAgents)
      setScrapeJobs(nextJobs)

      setScrapeDistrictId((current) => current || nextDistricts[0]?.id || '')
      setCallAgentId((current) => current || nextAgents[0]?.id || '')
    } catch (error) {
      setPageError(error instanceof Error ? error.message : 'Veriler yüklenemedi')
    } finally {
      setIsLoadingBaseData(false)
    }
  }

  async function refreshScrapeJobs() {
    try {
      const response = await fetch('/api/scraper')
      const data = await response.json()

      if (response.ok && Array.isArray(data)) {
        setScrapeJobs(data as ScrapeJob[])
      }
    } catch {
      // Son işler yüklenemese de ekran çalışmaya devam etsin.
    }
  }

  async function handleManualScrape() {
    if (!scrapeDistrictId) {
      setScrapeError('Tarama için önce ilçe seçin')
      return
    }

    setIsScraping(true)
    setScrapeError(null)
    setScrapeResult(null)

    try {
      const response = await fetch('/api/scraper', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          district_id: scrapeDistrictId,
          source_adapter: scrapeSource,
          category: scrapeCategory === 'all' ? undefined : scrapeCategory,
          limit: Number(scrapeLimit),
          skip_instagram: skipInstagram,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        setScrapeError(data.error ?? 'Tarama başlatılamadı')
        return
      }

      setScrapeResult({
        jobId: data.jobId,
        leadsFound: data.leadsFound ?? 0,
        leadsNew: data.leadsNew ?? 0,
        leadsUpdated: data.leadsUpdated ?? 0,
      })
      await refreshScrapeJobs()
    } catch {
      setScrapeError('Sunucuya bağlanılamadı')
    } finally {
      setIsScraping(false)
    }
  }

  async function handleCreateCallList() {
    if (!callAgentId) {
      setCallListError('Liste oluşturmak için telefon ajanı seçin')
      return
    }

    setIsCreatingCallList(true)
    setCallListError(null)
    setCallListResult(null)

    try {
      const response = await fetch('/api/calls', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agent_id: callAgentId,
          list_date: callListDate,
          max_items: Number(callMaxItems),
          min_score: Number(callMinScore),
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        setCallListError(data.error ?? 'Arama listesi oluşturulamadı')
        return
      }

      setCallListResult({
        id: data.id,
        total_items: data.total_items ?? 0,
        assignedExcluded: data.assignedExcluded,
        preferencesApplied: data.preferencesApplied,
      })
    } catch {
      setCallListError('Sunucuya bağlanılamadı')
    } finally {
      setIsCreatingCallList(false)
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

      if (!response.ok) {
        return
      }

      const data = await response.json()
      setScoreResult(data)
    } finally {
      setIsScoringAll(false)
    }
  }

  async function handleAuditBatch() {
    setIsAuditing(true)
    setAuditError(null)
    setAuditResult(null)

    const minScoreNum = Number(auditMinScore)
    const limitNum = Number(auditLimit)

    if (!Number.isFinite(minScoreNum) || minScoreNum < 0 || minScoreNum > 100) {
      setAuditError('minScore 0-100 arasında olmalı')
      setIsAuditing(false)
      return
    }
    if (!Number.isFinite(limitNum) || limitNum < 1 || limitNum > 100) {
      setAuditError('Limit 1-100 arasında olmalı')
      setIsAuditing(false)
      return
    }

    try {
      const response = await fetch('/api/audit/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ minScore: minScoreNum, limit: limitNum }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        setAuditError(data.error ?? 'Audit batch başarısız')
        return
      }
      setAuditResult(data as AuditBatchResult)
    } catch {
      setAuditError('Sunucuya bağlanılamadı')
    } finally {
      setIsAuditing(false)
    }
  }

  async function handleEnrichInstagram() {
    setIsEnrichingInstagram(true)
    setInstagramError(null)
    setInstagramResult({
      enriched: 0,
      processed: 0,
      backfilled: 0,
      unmatched: 0,
      failed: 0,
      remaining: null,
      completedAll: false,
      batches: 0,
      sources: {
        website_url: 0,
        website_html: 0,
        candidate_verified: 0,
      },
      matches: [],
    })

    try {
      let aggregate: InstagramEnrichmentState = {
        enriched: 0,
        processed: 0,
        backfilled: 0,
        unmatched: 0,
        failed: 0,
        remaining: null,
        completedAll: false,
        batches: 0,
        sources: {
          website_url: 0,
          website_html: 0,
          candidate_verified: 0,
        },
        matches: [],
      }

      for (let batch = 0; batch < INSTAGRAM_MAX_BATCHES; batch++) {
        const response = await fetch('/api/leads/enrich-instagram', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ limit: INSTAGRAM_BATCH_SIZE }),
        })
        const data = await response.json().catch(() => ({}))

        if (!response.ok) {
          setInstagramError(data.error ?? 'Instagram zenginleştirme başarısız')
          return
        }

        const nextMatches = Array.isArray(data.matches)
          ? data.matches.map((match: EnrichedInstagramMatch) => ({
              id: String(match.id),
              businessName: String(match.businessName),
              username: String(match.username),
              source: match.source,
            }))
          : []

        const matchMap = new Map<string, EnrichedInstagramMatch>()
        for (const match of aggregate.matches) {
          matchMap.set(match.id, match)
        }
        for (const match of nextMatches) {
          matchMap.set(match.id, match)
        }

        aggregate = {
          enriched: aggregate.enriched + (data.enriched ?? 0),
          processed: aggregate.processed + (data.processed ?? 0),
          backfilled: aggregate.backfilled + (data.backfilled ?? 0),
          unmatched: aggregate.unmatched + (data.unmatched ?? 0),
          failed: aggregate.failed + (data.failed ?? 0),
          remaining: data.remaining ?? aggregate.remaining,
          completedAll: data.completedAll ?? false,
          batches: batch + 1,
          sources: {
            website_url: aggregate.sources.website_url + (data.sources?.website_url ?? 0),
            website_html: aggregate.sources.website_html + (data.sources?.website_html ?? 0),
            candidate_verified: aggregate.sources.candidate_verified + (data.sources?.candidate_verified ?? 0),
          },
          matches: Array.from(matchMap.values()),
        }

        setInstagramResult(aggregate)

        if (data.completedAll === true || (data.processed ?? 0) === 0) {
          break
        }
      }
    } catch {
      setInstagramError('Sunucuya bağlanılamadı')
    } finally {
      setIsEnrichingInstagram(false)
    }
  }

  const todayLabel = `${formatLongDateInIstanbul(parseIstanbulDate(todayDate))} · ${DAY_TYPE_LABELS[dayType] ?? dayType}`

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Yönetim</h1>
        <p className="text-muted-foreground">
          Sistem şu an yalnızca telefon ajanlarıyla çalışıyor. Tarama ve arama listeleri manuel yönetiliyor.
        </p>
      </div>

      {pageError && (
        <div className="rounded-md border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700">
          {pageError}
        </div>
      )}

      <Card className="border-blue-200 bg-blue-50/60">
        <CardHeader>
          <CardTitle>Çalışma Düzeni</CardTitle>
          <CardDescription>
            Hafta içi her gün telefon araması yapılır. Otomatik dağıtım kapalıdır.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-sm font-medium">{todayLabel}</p>
            <p className="text-sm text-muted-foreground">
              Tarama için `Scraper`, manuel atama için `Arama Listesi Oluştur` aksiyonlarını kullanın.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge variant="secondary" className="bg-blue-100 text-blue-800">
              {activeTeleAgents.length} aktif telefon ajanı
            </Badge>
            <Badge variant="outline">{districts.length} aktif ilçe</Badge>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Manuel Tarama</CardTitle>
            <CardDescription>
              İlçe ve kategori seçip doğrudan yeni lead taraması başlatın.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <label className="text-sm font-medium">İlçe</label>
                <Select value={scrapeDistrictId} onValueChange={setScrapeDistrictId}>
                  <SelectTrigger>
                    <SelectValue placeholder="İlçe seçin" />
                  </SelectTrigger>
                  <SelectContent>
                    {districts.map((district) => (
                      <SelectItem key={district.id} value={district.id}>
                        {district.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Kaynak</label>
                <Select value={scrapeSource} onValueChange={(value) => setScrapeSource(value as ScrapeSource)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="google-places">Google Places</SelectItem>
                    <SelectItem value="apify">Apify</SelectItem>
                    <SelectItem value="instagram">Instagram</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Kategori</label>
                <Select value={scrapeCategory} onValueChange={setScrapeCategory}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Tüm kategoriler</SelectItem>
                    {CATEGORIES.map((category) => (
                      <SelectItem key={category} value={category}>
                        {category}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Limit</label>
                <Input
                  type="number"
                  min={1}
                  max={200}
                  value={scrapeLimit}
                  onChange={(event) => setScrapeLimit(event.target.value)}
                />
              </div>
            </div>

            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={skipInstagram}
                onChange={(event) => setSkipInstagram(event.target.checked)}
                className="h-4 w-4 rounded border-input"
              />
              Tarama sırasında Instagram zenginleştirmesini atla
            </label>

            <Button
              onClick={handleManualScrape}
              disabled={isScraping || isLoadingBaseData || districts.length === 0}
              className="w-full"
            >
              {isScraping ? 'Tarama çalışıyor...' : 'Taramayı Başlat'}
            </Button>

            {scrapeError && (
              <div className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-700">
                {scrapeError}
              </div>
            )}

            {scrapeResult && (
              <div className="rounded-md border border-green-300 bg-green-50 p-3 text-sm text-green-800">
                <p className="font-medium">Tarama tamamlandı</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Badge variant="secondary" className="bg-green-100 text-green-800">
                    {scrapeResult.leadsFound} lead bulundu
                  </Badge>
                  <Badge variant="outline">{scrapeResult.leadsNew} yeni</Badge>
                  <Badge variant="outline">{scrapeResult.leadsUpdated} güncellendi</Badge>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Manuel Arama Listesi</CardTitle>
            <CardDescription>
              Belirli bir telefon ajanı ve tarih için çağrı listesi üretin. Sistem kendiliğinden dağıtım yapmaz.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <label className="text-sm font-medium">Telefon ajanı</label>
                <Select value={callAgentId} onValueChange={setCallAgentId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Ajan seçin" />
                  </SelectTrigger>
                  <SelectContent>
                    {activeTeleAgents.map((agent) => (
                      <SelectItem key={agent.id} value={agent.id}>
                        {agent.full_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Liste tarihi</label>
                <Input
                  type="date"
                  value={callListDate}
                  onChange={(event) => setCallListDate(event.target.value)}
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Maksimum arama</label>
                <Input
                  type="number"
                  min={1}
                  max={100}
                  value={callMaxItems}
                  onChange={(event) => setCallMaxItems(event.target.value)}
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Minimum skor</label>
                <Input
                  type="number"
                  min={0}
                  max={100}
                  value={callMinScore}
                  onChange={(event) => setCallMinScore(event.target.value)}
                />
              </div>
            </div>

            <Button
              onClick={handleCreateCallList}
              disabled={isCreatingCallList || isLoadingBaseData || activeTeleAgents.length === 0}
              className="w-full"
            >
              {isCreatingCallList ? 'Liste oluşturuluyor...' : 'Arama Listesi Oluştur'}
            </Button>

            {callListError && (
              <div className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-700">
                {callListError}
              </div>
            )}

            {callListResult && (
              <div className="rounded-md border border-green-300 bg-green-50 p-3 text-sm text-green-800">
                <p className="font-medium">Arama listesi oluşturuldu</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Badge variant="secondary" className="bg-green-100 text-green-800">
                    {callListResult.total_items} kayıt atandı
                  </Badge>
                  {typeof callListResult.assignedExcluded === 'number' && (
                    <Badge variant="outline">
                      {callListResult.assignedExcluded} kayıt dışarıda kaldı
                    </Badge>
                  )}
                  {callListResult.preferencesApplied && (
                    <Badge variant="outline">Ajan tercihleri uygulandı</Badge>
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Toplu Puanlama</CardTitle>
            <CardDescription>
              Lead havuzundaki kayıtları tekrar puanlayın.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button onClick={handleScoreAll} disabled={isScoringAll} className="w-full">
              {isScoringAll ? 'Puanlanıyor...' : 'Tüm Leadleri Puanla'}
            </Button>

            {scoreResult && (
              <div className="rounded-md bg-muted p-3 text-sm">
                <p className="font-medium">Puanlama tamamlandı</p>
                <div className="mt-2 flex gap-2">
                  <Badge variant="secondary">{scoreResult.scored} güncellendi</Badge>
                  <Badge variant="outline">{scoreResult.total} toplam</Badge>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Instagram Zenginleştirme</CardTitle>
            <CardDescription>
              Tek seferde tum yeni Instagram kesif kuyrugunu isler. Hobby planda kalan profil detaylari gunluk Vercel cron ile tamamlanir.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button
              onClick={handleEnrichInstagram}
              disabled={isEnrichingInstagram}
              className="w-full"
              variant="secondary"
            >
              {isEnrichingInstagram ? 'Kuyruk işleniyor...' : 'Instagram Kuyruğunu İşle'}
            </Button>

            {instagramError && (
              <div className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-700">
                {instagramError}
              </div>
            )}

            {instagramResult && (
              <div className="rounded-md bg-pink-50 p-3 text-sm text-pink-800">
                <p className="font-medium">
                  {isEnrichingInstagram
                    ? `Kuyruk işleniyor · ${instagramResult.batches} batch tamamlandı`
                    : instagramResult.completedAll
                      ? 'Kuyruk tamamlandı'
                      : 'İşlem tamamlandı, kalan kayıtlar gunluk cron ile sürecek'}
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Badge variant="secondary" className="bg-pink-100 text-pink-800">
                    {instagramResult.processed} kayıt denendi
                  </Badge>
                  <Badge variant="outline">{instagramResult.enriched} hesap bulundu</Badge>
                  {instagramResult.backfilled > 0 && (
                    <Badge variant="outline">{instagramResult.backfilled} profil detayı güncellendi</Badge>
                  )}
                  {instagramResult.unmatched > 0 && (
                    <Badge variant="outline">{instagramResult.unmatched} kayitta hesap bulunamadi</Badge>
                  )}
                  {instagramResult.failed > 0 && (
                    <Badge variant="outline">{instagramResult.failed} kayıt atlandı</Badge>
                  )}
                  {instagramResult.sources.website_url > 0 && (
                    <Badge variant="outline">
                      {instagramResult.sources.website_url} {INSTAGRAM_DISCOVERY_SOURCE_LABELS.WEBSITE_URL}
                    </Badge>
                  )}
                  {instagramResult.sources.website_html > 0 && (
                    <Badge variant="outline">
                      {instagramResult.sources.website_html} {INSTAGRAM_DISCOVERY_SOURCE_LABELS.WEBSITE_HTML}
                    </Badge>
                  )}
                  {instagramResult.sources.candidate_verified > 0 && (
                    <Badge variant="outline">
                      {instagramResult.sources.candidate_verified} {INSTAGRAM_DISCOVERY_SOURCE_LABELS.CANDIDATE_VERIFIED}
                    </Badge>
                  )}
                  {instagramResult.remaining !== null && (
                    <Badge variant="outline">{instagramResult.remaining} kayıt bekliyor</Badge>
                  )}
                </div>

                {instagramResult.matches.length > 0 && (
                  <div className="mt-3 space-y-2">
                    <p className="text-xs font-medium uppercase tracking-wide text-pink-700">
                      Bulunan İşletmeler
                    </p>
                    <div className="space-y-2">
                      {instagramResult.matches.map((match) => (
                        <div
                          key={match.id}
                          className="flex flex-col gap-1 rounded-md border border-pink-200 bg-white/70 px-3 py-2 md:flex-row md:items-center md:justify-between"
                        >
                          <div>
                            <p className="font-medium text-slate-900">{match.businessName}</p>
                            <p className="text-xs text-slate-600">
                              {INSTAGRAM_DISCOVERY_SOURCE_LABELS[match.source]}
                            </p>
                          </div>
                          <a
                            href={`https://instagram.com/${match.username}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-sm font-medium text-pink-700 hover:underline"
                          >
                            @{match.username}
                          </a>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Audit Batch (Sonnet 4.6)</CardTitle>
            <CardDescription>
              Yüksek/orta öncelikli leadleri toplu audit&apos;e gönder. Outscraper review enrichment + LLM synthesis + paylaşılabilir slug üretir.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground">Min skor</label>
                <Input
                  type="number"
                  min={0}
                  max={100}
                  value={auditMinScore}
                  onChange={(e) => setAuditMinScore(e.target.value)}
                  disabled={isAuditing}
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Limit</label>
                <Input
                  type="number"
                  min={1}
                  max={100}
                  value={auditLimit}
                  onChange={(e) => setAuditLimit(e.target.value)}
                  disabled={isAuditing}
                />
              </div>
            </div>

            <Button
              onClick={handleAuditBatch}
              disabled={isAuditing}
              className="w-full"
              variant="secondary"
            >
              {isAuditing ? 'Audit batch çalışıyor...' : 'Audit batch başlat'}
            </Button>

            {auditError && (
              <div className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-700">
                {auditError}
              </div>
            )}

            {auditResult && (
              <div className="rounded-md bg-indigo-50 p-3 text-sm text-indigo-900">
                <p className="font-medium">Audit batch tamamlandı</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Badge variant="secondary" className="bg-indigo-100 text-indigo-800">
                    {auditResult.eligible} uygun lead
                  </Badge>
                  <Badge variant="outline">{auditResult.synthesized} audit üretildi</Badge>
                  {auditResult.enriched > 0 && (
                    <Badge variant="outline">{auditResult.enriched} GBP review enrich</Badge>
                  )}
                  {auditResult.skipped > 0 && (
                    <Badge variant="outline">{auditResult.skipped} atlandı</Badge>
                  )}
                  {auditResult.errors.length > 0 && (
                    <Badge variant="outline">{auditResult.errors.length} hata</Badge>
                  )}
                </div>
                <p className="mt-2 text-xs">
                  Tahmini maliyet:{' '}
                  <span className="font-semibold">
                    ${auditResult.estimatedCostUsd.total.toFixed(3)}
                  </span>{' '}
                  (GBP ${auditResult.estimatedCostUsd.gbp.toFixed(3)}, LLM $
                  {auditResult.estimatedCostUsd.llm.toFixed(3)})
                </p>
                {auditResult.errors.length > 0 && (
                  <details className="mt-2 text-xs">
                    <summary className="cursor-pointer font-medium">Hata detayları</summary>
                    <ul className="mt-1 space-y-1 max-h-40 overflow-y-auto">
                      {auditResult.errors.slice(0, 10).map((e, idx) => (
                        <li key={idx} className="text-red-700">
                          [{e.stage}] {e.leadId}: {e.message}
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Son Tarama İşleri</CardTitle>
            <CardDescription>
              En güncel manuel tarama sonuçları.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {scrapeJobs.slice(0, 5).map((job) => (
              <div key={job.id} className="rounded-lg border p-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium">{job.category || 'Genel tarama'}</p>
                    <p className="text-xs text-muted-foreground">
                      {job.source_adapter} · {job.created_at.slice(0, 10)}
                    </p>
                  </div>
                  <Badge variant="secondary" className={JOB_STATUS_CLASSES[job.status] ?? ''}>
                    {JOB_STATUS_LABELS[job.status] ?? job.status}
                  </Badge>
                </div>
                <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted-foreground">
                  <span>{job.leads_found} bulundu</span>
                  <span>{job.leads_new} yeni</span>
                  <span>{job.leads_updated} güncellendi</span>
                </div>
              </div>
            ))}

            {scrapeJobs.length === 0 && (
              <p className="text-sm text-muted-foreground">
                Henüz manuel tarama çalıştırılmadı.
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
