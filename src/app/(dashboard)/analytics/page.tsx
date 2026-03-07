'use client'

import { useState, useEffect } from 'react'
import type { AnalyticsDashboardData } from '@/types'
import { KPICards } from '@/components/analytics/kpi-cards'
import { LeadFunnelChart } from '@/components/analytics/lead-funnel-chart'
import { RecommendationChart } from '@/components/analytics/recommendation-chart'
import { TrendChart } from '@/components/analytics/trend-chart'
import { CategoryBreakdownChart } from '@/components/analytics/category-breakdown-chart'
import { CallOutcomeChart } from '@/components/analytics/call-outcome-chart'
import { AgentPerformanceChart } from '@/components/analytics/agent-performance-chart'

function formatDate(date: Date): string {
  return date.toISOString().split('T')[0]
}

function getDefaultDates() {
  const now = new Date()
  return {
    endDate: formatDate(now),
    startDate: formatDate(new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)),
  }
}

type Preset = 'last7' | 'last30' | 'thisMonth' | 'all'

export default function AnalyticsPage() {
  const defaults = getDefaultDates()
  const [startDate, setStartDate] = useState(defaults.startDate)
  const [endDate, setEndDate] = useState(defaults.endDate)
  const [activePreset, setActivePreset] = useState<Preset | null>('last30')
  const [data, setData] = useState<AnalyticsDashboardData | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Tarih değiştiğinde verileri yeniden yükle
  useEffect(() => {
    let isCancelled = false

    const loadData = async () => {
      setIsLoading(true)
      setError(null)
      try {
        const params = new URLSearchParams()
        if (startDate) params.set('startDate', startDate)
        if (endDate) params.set('endDate', endDate)
        const res = await fetch(`/api/analytics?${params.toString()}`)
        if (!res.ok) throw new Error('Veriler alınamadı')
        const d: AnalyticsDashboardData = await res.json()
        if (!isCancelled) {
          setData(d)
        }
      } catch (err) {
        if (!isCancelled) {
          setError(err instanceof Error ? err.message : 'Bilinmeyen hata')
        }
      } finally {
        if (!isCancelled) {
          setIsLoading(false)
        }
      }
    }

    loadData()

    return () => {
      isCancelled = true
    }
  }, [startDate, endDate])

  const applyPreset = (preset: Preset) => {
    const now = new Date()
    setActivePreset(preset)
    switch (preset) {
      case 'last7': {
        setEndDate(formatDate(now))
        setStartDate(formatDate(new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)))
        break
      }
      case 'last30': {
        setEndDate(formatDate(now))
        setStartDate(formatDate(new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)))
        break
      }
      case 'thisMonth': {
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
        setEndDate(formatDate(now))
        setStartDate(formatDate(monthStart))
        break
      }
      case 'all': {
        setEndDate(formatDate(now))
        setStartDate('2020-01-01')
        break
      }
    }
  }

  const presetButtons: { key: Preset; label: string }[] = [
    { key: 'last7', label: 'Son 7 Gün' },
    { key: 'last30', label: 'Son 30 Gün' },
    { key: 'thisMonth', label: 'Bu Ay' },
    { key: 'all', label: 'Tüm Zamanlar' },
  ]

  const dateFilter = (
    <div className="flex flex-wrap items-center gap-3">
      <div className="flex items-center gap-2">
        <input
          type="date"
          value={startDate}
          onChange={(e) => { setStartDate(e.target.value); setActivePreset(null) }}
          className="rounded-md border px-3 py-1.5 text-sm"
        />
        <span className="text-muted-foreground text-sm">—</span>
        <input
          type="date"
          value={endDate}
          onChange={(e) => { setEndDate(e.target.value); setActivePreset(null) }}
          className="rounded-md border px-3 py-1.5 text-sm"
        />
      </div>
      <div className="flex gap-1.5">
        {presetButtons.map((p) => (
          <button
            key={p.key}
            onClick={() => applyPreset(p.key)}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              activePreset === p.key
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted hover:bg-muted/80 text-muted-foreground'
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>
    </div>
  )

  if (isLoading && !data) {
    return (
      <div className="space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold">Analitik</h1>
            <p className="text-muted-foreground">Satış performansı ve lead analizi</p>
          </div>
          {dateFilter}
        </div>
        <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-[120px] animate-pulse rounded-xl border bg-muted" />
          ))}
        </div>
        <div className="grid gap-6 md:grid-cols-2">
          <div className="h-[400px] animate-pulse rounded-xl border bg-muted" />
          <div className="h-[400px] animate-pulse rounded-xl border bg-muted" />
        </div>
        <div className="h-[400px] animate-pulse rounded-xl border bg-muted" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold">Analitik</h1>
            <p className="text-muted-foreground">Satış performansı ve lead analizi</p>
          </div>
          {dateFilter}
        </div>
        <div className="rounded-md bg-red-50 p-4 text-sm text-red-800">
          Veriler yüklenirken hata oluştu: {error}
        </div>
      </div>
    )
  }

  if (!data) return null

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Analitik</h1>
          <p className="text-muted-foreground">Satış performansı ve lead analizi</p>
        </div>
        {dateFilter}
      </div>

      {isLoading && (
        <div className="text-muted-foreground text-center text-sm py-2">Yükleniyor...</div>
      )}

      {/* KPI Cards */}
      <KPICards data={data.kpi} />

      {/* Lead Funnel + Recommendation Pie */}
      <div className="grid gap-6 md:grid-cols-2">
        <LeadFunnelChart data={data.statusFunnel} />
        <RecommendationChart data={data.recommendationDistribution} />
      </div>

      {/* Trend Chart — full width */}
      <TrendChart data={data.weeklyTrend} />

      {/* Category Breakdown + Call Outcomes */}
      <div className="grid gap-6 md:grid-cols-2">
        <CategoryBreakdownChart data={data.categoryBreakdown} />
        <CallOutcomeChart data={data.callOutcomes} />
      </div>

      {/* Agent Performance — full width */}
      <AgentPerformanceChart data={data.agentPerformance} />
    </div>
  )
}
