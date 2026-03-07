'use client'

import { useState, useEffect, use } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ActivityTimeline } from '@/components/leads/activity-timeline'
import type { Lead } from '@/types/database'

export default function LeadDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const [lead, setLead] = useState<Lead | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    async function fetchLead() {
      try {
        const response = await fetch(`/api/leads/${id}`)
        if (response.ok) {
          const data = await response.json()
          setLead(data)
        }
      } finally {
        setIsLoading(false)
      }
    }
    fetchLead()
  }, [id])

  if (isLoading) {
    return <div className="py-12 text-center text-muted-foreground">Yükleniyor...</div>
  }

  if (!lead) {
    return (
      <div className="py-12 text-center">
        <p className="text-muted-foreground">Lead bulunamadı</p>
        <Link href="/leads">
          <Button variant="outline" className="mt-4">Listeye Dön</Button>
        </Link>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Başlık */}
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Link href="/leads" className="text-sm text-muted-foreground hover:underline">
              Müşteriler
            </Link>
            <span className="text-sm text-muted-foreground">/</span>
          </div>
          <h1 className="text-2xl font-bold">{lead.business_name}</h1>
          <p className="text-muted-foreground">{lead.category ?? 'Kategori belirtilmemiş'}</p>
        </div>
        <Badge
          variant="secondary"
          className="text-base"
        >
          Puan: {lead.need_score}/100
        </Badge>
      </div>

      {/* Puan Kartları */}
      <div className="grid gap-4 grid-cols-2 md:grid-cols-5">
        <Card className="col-span-2 md:col-span-1">
          <CardContent className="pt-6">
            <div className="text-3xl font-bold">{lead.need_score}</div>
            <p className="text-sm text-muted-foreground">Toplam Puan</p>
            <div className="mt-2">
              <Badge variant="secondary">
                {lead.recommendation === 'HIGH_PRIORITY' && 'Saha Ziyareti'}
                {lead.recommendation === 'MEDIUM' && 'Telefon Arama'}
                {lead.recommendation === 'LOW_PRIORITY' && 'Otonom Temas'}
                {lead.recommendation === 'SKIP' && 'Pas Geç'}
              </Badge>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-3xl font-bold">{lead.google_sub_score}/30</div>
            <p className="text-sm text-muted-foreground">Google</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-3xl font-bold">{lead.instagram_sub_score}/30</div>
            <p className="text-sm text-muted-foreground">Instagram</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-3xl font-bold">{lead.website_sub_score}/30</div>
            <p className="text-sm text-muted-foreground">Website</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-3xl font-bold">{lead.marketing_sub_score}/20</div>
            <p className="text-sm text-muted-foreground">Marketing</p>
          </CardContent>
        </Card>
      </div>

      {/* Detay Sekmeleri */}
      <Tabs defaultValue="info">
        <TabsList>
          <TabsTrigger value="info">Bilgiler</TabsTrigger>
          <TabsTrigger value="google">Google</TabsTrigger>
          <TabsTrigger value="instagram">Instagram</TabsTrigger>
          <TabsTrigger value="website">Website</TabsTrigger>
          <TabsTrigger value="marketing">Marketing</TabsTrigger>
          <TabsTrigger value="activity">Aktivite</TabsTrigger>
        </TabsList>

        <TabsContent value="info" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>İletişim Bilgileri</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <InfoRow label="Adres" value={lead.address} />
              <InfoRow label="Telefon" value={lead.phone} />
              <InfoRow label="E-posta" value={lead.email} link={false} />
              <InfoRow label="Website" value={lead.website} link />
              <InfoRow label="Durum" value={lead.status} />
              {lead.lat && lead.lng && (
                <InfoRow
                  label="Konum"
                  value={`${lead.lat.toFixed(4)}, ${lead.lng.toFixed(4)}`}
                />
              )}
              <InfoRow label="Notlar" value={lead.notes} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="google" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Google Profil Verileri</CardTitle>
              <CardDescription>Google Places API&apos;den alınan veriler</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <InfoRow label="Place ID" value={lead.google_place_id} />
              <InfoRow label="Puan" value={lead.google_rating?.toString()} />
              <InfoRow label="Yorum Sayısı" value={lead.google_review_count?.toString()} />
              <InfoRow label="Fotoğraf Sayısı" value={lead.google_photo_count?.toString()} />
              <InfoRow
                label="Profil Talep Edilmiş"
                value={lead.google_is_claimed === null ? null : lead.google_is_claimed ? 'Evet' : 'Hayır'}
              />
              <InfoRow label="Son Güncelleme" value={lead.google_last_updated} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="instagram" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Instagram Profil Verileri</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-start justify-between border-b pb-2">
                <span className="text-sm text-muted-foreground">Kullanıcı Adı</span>
                {lead.ig_username ? (
                  <a
                    href={`https://instagram.com/${lead.ig_username}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm font-medium text-pink-600 hover:text-pink-800 hover:underline"
                  >
                    @{lead.ig_username}
                  </a>
                ) : (
                  <span className="text-sm text-muted-foreground">-</span>
                )}
              </div>
              <InfoRow label="Takipçi" value={lead.ig_follower_count?.toString()} />
              <InfoRow label="Gönderi Sayısı" value={lead.ig_post_count?.toString()} />
              <InfoRow label="Ort. Beğeni" value={lead.ig_avg_likes?.toString()} />
              <InfoRow label="Son Gönderi" value={lead.ig_last_post_date} />
              <InfoRow
                label="Highlight Var"
                value={lead.ig_has_highlights === null ? null : lead.ig_has_highlights ? 'Evet' : 'Hayır'}
              />
              <InfoRow
                label="Ajans Tespit"
                value={lead.ig_bio_contains_agency === null ? null : lead.ig_bio_contains_agency ? 'Evet' : 'Hayır'}
              />
              <InfoRow
                label="Bio Link"
                value={lead.ig_has_bio_link === null ? null : lead.ig_has_bio_link ? 'Evet' : 'Hayır'}
              />
              <InfoRow label="Etkileşim Oranı" value={lead.ig_engagement_rate != null ? `%${lead.ig_engagement_rate.toFixed(2)}` : null} />
              <InfoRow label="Gönderi Düzeni" value={lead.ig_posting_regularity} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="website" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Website Analiz Verileri</CardTitle>
              <CardDescription>PageSpeed Insights analizi</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <InfoRow label="Website" value={lead.website} link />
              <InfoRow label="Hız Skoru" value={lead.website_speed_score != null ? `${lead.website_speed_score}/100` : null} />
              <InfoRow
                label="Mobil Uyumlu"
                value={lead.website_is_mobile_friendly === null ? null : lead.website_is_mobile_friendly ? 'Evet' : 'Hayır'}
              />
              <InfoRow
                label="404 Hatası"
                value={lead.website_has_404s === null ? null : lead.website_has_404s ? 'Evet' : 'Hayır'}
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="marketing" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Marketing Altyapısı</CardTitle>
              <CardDescription>Tracking ve reklam verileri</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <InfoRow
                label="Meta Pixel"
                value={lead.website_has_meta_pixel === null ? null : lead.website_has_meta_pixel ? 'Evet' : 'Hayır'}
              />
              <InfoRow
                label="GA4"
                value={lead.website_has_ga4 === null ? null : lead.website_has_ga4 ? 'Evet' : 'Hayır'}
              />
              <InfoRow
                label="Meta Reklam"
                value={lead.has_active_meta_ads === null ? 'Bilinmiyor' : lead.has_active_meta_ads ? 'Aktif' : 'Yok'}
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="activity">
          <ActivityTimeline leadId={id} />
        </TabsContent>
      </Tabs>
    </div>
  )
}

function InfoRow({ label, value, link }: { label: string; value: string | null | undefined; link?: boolean }) {
  return (
    <div className="flex items-start justify-between border-b pb-2 last:border-0">
      <span className="text-sm text-muted-foreground">{label}</span>
      {value ? (
        link ? (
          <a
            href={value.startsWith('http') ? value : `https://${value}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-blue-600 hover:underline"
          >
            {value}
          </a>
        ) : (
          <span className="text-sm font-medium">{value}</span>
        )
      ) : (
        <span className="text-sm text-muted-foreground">-</span>
      )}
    </div>
  )
}
