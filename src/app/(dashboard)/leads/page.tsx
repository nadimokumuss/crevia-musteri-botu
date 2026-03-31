'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
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
import { LeadCategoryCards } from '@/components/leads/lead-category-cards'
import { CATEGORIES } from '@/lib/constants'
import type { Lead, LeadRecommendation, LeadStatus } from '@/types/database'

interface District {
  id: string
  name: string
  is_active: boolean
}

const RECOMMENDATION_CONFIG: Record<LeadRecommendation, { label: string; className: string }> = {
  HIGH_PRIORITY: { label: 'Oncelikli Arama', className: 'bg-red-100 text-red-800' },
  MEDIUM: { label: 'Planli Arama', className: 'bg-yellow-100 text-yellow-800' },
  LOW_PRIORITY: { label: 'Takip Havuzu', className: 'bg-blue-100 text-blue-800' },
  SKIP: { label: 'Pas Gec', className: 'bg-gray-100 text-gray-800' },
}

const STATUS_CONFIG: Record<LeadStatus, { label: string; className: string }> = {
  NEW: { label: 'Yeni', className: 'bg-blue-100 text-blue-800' },
  CONTACTED: { label: 'İletişim Kuruldu', className: 'bg-cyan-100 text-cyan-800' },
  QUALIFIED: { label: 'Nitelikli', className: 'bg-green-100 text-green-800' },
  PROPOSAL: { label: 'Teklif', className: 'bg-purple-100 text-purple-800' },
  WON: { label: 'Kazanıldı', className: 'bg-emerald-100 text-emerald-800' },
  LOST: { label: 'Kaybedildi', className: 'bg-red-100 text-red-800' },
  SKIP: { label: 'Atla', className: 'bg-gray-100 text-gray-800' },
}

interface PaginationData {
  page: number
  limit: number
  total: number
  totalPages: number
}

export default function LeadsPage() {
  const [leads, setLeads] = useState<Lead[]>([])
  const [districts, setDistricts] = useState<District[]>([])
  const [pagination, setPagination] = useState<PaginationData>({
    page: 1, limit: 20, total: 0, totalPages: 0,
  })
  const [search, setSearch] = useState('')
  const [districtFilter, setDistrictFilter] = useState<string>('all')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [categoryFilter, setCategoryFilter] = useState<string>('all')
  const [recommendationFilter, setRecommendationFilter] = useState<string>('all')
  const [sortBy, setSortBy] = useState('created_at')
  const [categoryView, setCategoryView] = useState<string>('')
  const [isLoading, setIsLoading] = useState(false)

  // İlçeleri yükle
  useEffect(() => {
    fetch('/api/districts?is_active=true')
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data)) setDistricts(data)
      })
      .catch(() => {})
  }, [])

  const loadLeads = useCallback(async (page: number = 1) => {
    setIsLoading(true)
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: '20',
        sort_by: sortBy,
        sort_order: 'desc',
      })

      if (search) params.set('search', search)
      if (districtFilter !== 'all') params.set('district_id', districtFilter)
      if (statusFilter !== 'all') params.set('status', statusFilter)
      if (categoryFilter !== 'all') params.set('category', categoryFilter)
      if (recommendationFilter !== 'all') params.set('recommendation', recommendationFilter)

      // Kategori kartı filtresi
      if (categoryView === 'high_priority') {
        params.set('recommendation', 'HIGH_PRIORITY')
        params.set('status', 'NEW')
      } else if (categoryView === 'new_recent') {
        params.set('sort_by', 'created_at')
        params.set('recent_days', '7')
      } else if (categoryView === 'contacted') {
        params.set('status', 'CONTACTED')
      } else if (categoryView === 'proposal') {
        params.set('status', 'PROPOSAL')
      } else if (categoryView === 'visited') {
        params.set('assignment_status', 'COMPLETED')
        params.set('assignment_type', 'VISIT')
      } else if (categoryView === 'callback') {
        params.set('call_status', 'CALLBACK')
      }

      const response = await fetch(`/api/leads?${params}`)
      if (response.ok) {
        const data = await response.json()
        setLeads(data.data ?? [])
        setPagination(data.pagination)
      }
    } finally {
      setIsLoading(false)
    }
  }, [search, districtFilter, statusFilter, categoryFilter, recommendationFilter, sortBy, categoryView])

  useEffect(() => {
    loadLeads()
  }, [loadLeads])

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Potansiyel Müşteriler</h1>
          <p className="text-muted-foreground">
            {pagination.total} müşteri bulundu
          </p>
        </div>
      </div>

      {/* Kategori Kartları */}
      <LeadCategoryCards
        onCategorySelect={(view) => {
          setCategoryView(view)
          // Kategori seçildiğinde filtre sıfırla
          if (view) {
            setStatusFilter('all')
            setRecommendationFilter('all')
          }
        }}
        activeView={categoryView}
      />

      {/* Filtreler */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-wrap items-end gap-4">
            <div className="min-w-[160px] flex-1 space-y-2">
              <label className="text-sm font-medium">Ara</label>
              <Input
                placeholder="İşletme adı..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && loadLeads()}
              />
            </div>

            <div className="min-w-[160px] space-y-2">
              <label className="text-sm font-medium">İlçe</label>
              <Select value={districtFilter} onValueChange={setDistrictFilter}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tüm İlçeler</SelectItem>
                  {districts.map((d) => (
                    <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="min-w-[160px] space-y-2">
              <label className="text-sm font-medium">Kategori</label>
              <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tümü</SelectItem>
                  {CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="min-w-[140px] space-y-2">
              <label className="text-sm font-medium">Durum</label>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tümü</SelectItem>
                  <SelectItem value="NEW">Yeni</SelectItem>
                  <SelectItem value="CONTACTED">İletişim Kuruldu</SelectItem>
                  <SelectItem value="QUALIFIED">Nitelikli</SelectItem>
                  <SelectItem value="PROPOSAL">Teklif</SelectItem>
                  <SelectItem value="WON">Kazanıldı</SelectItem>
                  <SelectItem value="LOST">Kaybedildi</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="min-w-[140px] space-y-2">
              <label className="text-sm font-medium">Öneri</label>
              <Select value={recommendationFilter} onValueChange={setRecommendationFilter}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tümü</SelectItem>
                  <SelectItem value="HIGH_PRIORITY">Oncelikli Arama</SelectItem>
                  <SelectItem value="MEDIUM">Planli Arama</SelectItem>
                  <SelectItem value="LOW_PRIORITY">Takip Havuzu</SelectItem>
                  <SelectItem value="SKIP">Pas Gec</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="min-w-[140px] space-y-2">
              <label className="text-sm font-medium">Sıralama</label>
              <Select value={sortBy} onValueChange={setSortBy}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="need_score">Puan</SelectItem>
                  <SelectItem value="created_at">Tarih</SelectItem>
                  <SelectItem value="business_name">İsim</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Button onClick={() => loadLeads()} disabled={isLoading}>
              {isLoading ? 'Yükleniyor...' : 'Filtrele'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Tablo */}
      <Card>
        <CardHeader>
          <CardTitle>Müşteri Listesi</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>İşletme</TableHead>
                <TableHead>İlçe</TableHead>
                <TableHead>Kategori</TableHead>
                <TableHead className="text-center">Puan</TableHead>
                <TableHead>Öneri</TableHead>
                <TableHead>Durum</TableHead>
                <TableHead>Telefon</TableHead>
                <TableHead>E-posta</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {leads.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="py-8 text-center text-muted-foreground">
                    {isLoading ? 'Yükleniyor...' : 'Müşteri bulunamadı'}
                  </TableCell>
                </TableRow>
              ) : (
                leads.map((lead) => (
                  <TableRow key={lead.id}>
                    <TableCell>
                      <Link
                        href={`/leads/${lead.id}`}
                        className="font-medium hover:underline"
                      >
                        {lead.business_name}
                      </Link>
                    </TableCell>
                    <TableCell>
                      {districts.find((d) => d.id === lead.district_id)?.name ?? '-'}
                    </TableCell>
                    <TableCell>{lead.category ?? '-'}</TableCell>
                    <TableCell className="text-center font-bold">{lead.need_score}</TableCell>
                    <TableCell>
                      <Badge
                        variant="secondary"
                        className={RECOMMENDATION_CONFIG[lead.recommendation].className}
                      >
                        {RECOMMENDATION_CONFIG[lead.recommendation].label}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="secondary"
                        className={STATUS_CONFIG[lead.status].className}
                      >
                        {STATUS_CONFIG[lead.status].label}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {lead.phone ? (
                        <a href={`tel:${lead.phone}`} className="text-blue-600">
                          {lead.phone}
                        </a>
                      ) : (
                        '-'
                      )}
                    </TableCell>
                    <TableCell>
                      {lead.email ? (
                        <a href={`mailto:${lead.email}`} className="text-blue-600">
                          {lead.email}
                        </a>
                      ) : (
                        '-'
                      )}
                    </TableCell>
                    <TableCell>
                      <Link href={`/leads/${lead.id}`}>
                        <Button variant="ghost" size="sm">Detay</Button>
                      </Link>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>

          {/* Sayfalama */}
          {pagination.totalPages > 1 && (
            <div className="mt-4 flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                Sayfa {pagination.page} / {pagination.totalPages}
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={pagination.page <= 1}
                  onClick={() => loadLeads(pagination.page - 1)}
                >
                  Önceki
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={pagination.page >= pagination.totalPages}
                  onClick={() => loadLeads(pagination.page + 1)}
                >
                  Sonraki
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
