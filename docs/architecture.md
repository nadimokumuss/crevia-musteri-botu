# Crevia Sales OS - Mimari

## Katmanli Mimari

```
src/
├── app/          → Next.js App Router (UI + API routes)
├── core/         → Saf is mantigi (I/O YOK)
│   ├── scoring/      → Need Score algoritmasi (4-sutunlu: Google + Instagram + Website + Marketing)
│   ├── routing/      → DBSCAN kumeleme, TSP optimizasyon, arama listesi uretimi
│   ├── assignment/   → Dagitim, catisma onleme (UNIQUE constraint + kilit)
│   └── scheduler/    → Haftalik planlayici + dagitici
├── infra/        → Dis adaptorler (I/O siniri)
│   ├── supabase/     → DB client (server + browser + aktivite loglama)
│   ├── scrapers/     → ILeadSource adaptorleri (Google Places, Apify, Instagram)
│   ├── maps/         → IMapProvider adaptorleri (Google Distance Matrix)
│   ├── website/      → PageSpeed Insights adaptor
│   └── auth/         → Supabase Auth (PKCE flow)
├── lib/          → Paylasilan yardimcilar (logger, errors, constants, validators, utils)
├── hooks/        → React hook'lari (useCurrentUser, useRealtime)
├── components/   → React UI bilesenleri (shadcn/ui + Recharts)
└── types/        → TypeScript tip tanimlari (9 dosya)
```

## Veri Akislari

### Ana Is Akisi

```
Haftalik Plan → Tarama → DB'ye Kayit → Otomatik Puanlama → Dagitim → Rota/Arama Listesi → Saha/Telefon → Sonuc Takibi → Analitik
```

### Haftalik Plan Akisi (Client-Driven)
1. Admin "Haftalik Plan Olustur" tiklar
2. `POST /api/weekly-plan` → plan kaydi + `scrapeConfigs[]` doner (kategori-spesifik + ilce bazli genel tarama, scraper CAGIRMAZ)
3. Frontend her config icin `POST /api/scraper` cagirir (paralel)
4. Her scrape job kendi Vercel function instance'inda senkron calisir
5. Bulunan leadler DB'ye eklenir/guncellenir (email, telefon, website dahil)
6. Tum etkilenen leadler otomatik puanlanir (4-sutunlu Need Score)
7. Frontend tamamlanan sayisini client-side takip eder (progress bar)
8. Tumunu bitince frontend `POST /api/weekly-plan/distribute` cagirir
9. Puanlanan leadler ajanlara iki gecisli round-robin ile dagitilir:
   - FIELD ajanlar → saha ziyareti rotasi (Sali/Persembe, 10/gun) + arama listesi (Pazartesi/Carsamba, 20/gun)
   - TELESALES ajanlar → arama listesi (Pazartesi-Cuma, 20/gun)
   - Pass 1: Tercih eslesen lead'ler needScore sirasina gore round-robin dagitilir (exact match)
   - Pass 2: Tercihi OLMAYAN ajanlara kalan lead'ler tercih gozetmeden dagitilir
   - Telefon numarasi olmayan lead'ler arama listesine atanmaz
   - Koordinati olmayan lead'ler saha rotasina atanmaz
10. routes, call_lists VE assignments tablolarina kayit yazilir
11. Tekrar dagitim onlenir: Daha once atanmis leadler atlanir

**Not**: Stuck plan (SCRAPING statusunde 10 dk+) otomatik temizlenir. Manuel sifirlama `DELETE /api/weekly-plan` ile yapilir (COMPLETED ve FAILED planlar dahil, sadece DISTRIBUTING engellidir).

### Rota Olusturma Akisi
1. Kullanici Routes sayfasindan ajan + tarih + maks durak secer
2. En yuksek puanli, koordinatli NEW leadler otomatik secilir
3. DBSCAN ile cografi kumeleme yapilir
4. Nearest Neighbor + 2-opt TSP ile rota optimize edilir
5. Rota DB'ye kaydedilir ve haritada gosterilir

### Aktivite Loglama Akisi
1. API endpoint basarili bir islem gerceklestirir (durum degisikligi, atama, arama vb.)
2. `logLeadActivity()` fire-and-forget olarak cagirilir
3. `lead_activities` tablosuna kayit eklenir (service role client ile)
4. Hata durumunda sadece logger'a yazilir, ana islem etkilenmez
5. Lead detay sayfasindaki "Aktivite" sekmesinde kronolojik timeline olarak gosterilir

## Anahtar Kararlar

| Karar | Secim | Gerekce |
|-------|-------|---------|
| Framework | Next.js 16 (App Router) | React 19, Server Components |
| DB | Supabase (PostgreSQL) | RLS, Auth, Realtime |
| UI | shadcn/ui + Tailwind | Esnek, lightweight |
| Grafikler | Recharts | React-native, responsive |
| Harita | React-Leaflet + OSM | Ucretsiz |
| Kumeleme | DBSCAN | Kume sayisi bilinmiyor |
| TSP | NN + 2-opt | 15 durak < 50ms |
| State | Server Components + Zustand + TanStack Query | Minimal, cache-friendly |
| Scraping | Google Places API v1 + Apify | Birincil/ikincil kaynak |
| Instagram | Apify Instagram Scraper | Profil analizi + zenginlestirme |
| Website | PageSpeed Insights | Hiz, mobil uyum, 404 tespiti |
| PDF/Excel | jsPDF + xlsx | Rota + arama listesi export |
| Auth | Supabase Auth (PKCE) | Guvenli, oturum yonetimi |
| Deploy | Vercel + Supabase Cloud | Frankfurt (fra1) |

## Veritabani

10 tablo (tumunde RLS aktif):

### districts
Istanbul ilceleri (ad, konum, polygon).

### leads
Potansiyel musteriler. Onemli alanlar:
- Isletme: business_name, category, address, phone, email, website, lat, lng
- Google: google_place_id, google_rating, google_review_count, google_photo_count, google_is_claimed, google_last_updated, google_response_rate
- Instagram: ig_username, ig_follower_count, ig_post_count, ig_avg_likes, ig_last_post_date, ig_has_highlights, ig_bio_contains_agency, ig_has_bio_link, ig_engagement_rate, ig_posting_regularity, ig_reels_ratio
- Website: website_speed_score, website_is_mobile_friendly, website_has_404s, website_has_meta_pixel, website_has_ga4
- Marketing: has_active_meta_ads
- Puanlama: need_score (0-100), google_sub_score (0-30), instagram_sub_score (0-30), website_sub_score (0-30), marketing_sub_score (0-20), recommendation
- Durum: status (NEW/CONTACTED/QUALIFIED/PROPOSAL/WON/LOST/SKIP), notes

### agents
Satis ajanlari. Roller: ADMIN, FIELD_AGENT, TELESALES_AGENT.

### assignments
Lead-ajan atamalari. UNIQUE constraint: (lead_id, scheduled_date, assignment_type).
**Dikkat**: agents tablosuna IKI FK var (agent_id + locked_by) — join'lerde `agents!agent_id` ile disambiguate et.

### routes
Gunluk saha rotalari. stops JSONB dizisi (lead_id, siralama, durum, notlar).

### scrape_jobs
Tarama is kayitlari. Haftalik plan ile iliskilendirilebilir (weekly_plan_id FK).

### call_lists
Telefon arama listeleri. items JSONB dizisi (leadId, status, outcome, notes).

### lead_activities
Kronolojik audit trail. Aktivite tipleri: STATUS_CHANGE, ASSIGNMENT_CREATED, ASSIGNMENT_UPDATED, CALL_LOGGED, VISIT_LOGGED, SCORE_CALCULATED, NOTE_ADDED, LEAD_CREATED. old_value/new_value ile degisiklik takibi. agents join ile ajan adi.

### agent_preferences
Ajan tercihleri. district_ids (UUID dizisi), categories (TEXT dizisi). Haftalik plan sistemi tarafindan kullanilir. Ajan olusturuldiginda bos kayit otomatik eklenir. Tercihsiz ajan = tum lead'lere acik (dagitimdan dislanmaz). Tercihler tamamen temizlenebilir (bos dizi gonderilebilir).

### weekly_plans
Haftalik plan kayitlari. Durumlar: SCRAPING → DISTRIBUTING → COMPLETED/FAILED. scrape_job_ids ile iliskili tarama isleri, distribution_stats ile dagitim istatistikleri.

## API Endpoints

### Leads
| Method | Endpoint | Aciklama |
|--------|----------|----------|
| GET | /api/leads | Lead listele (filtreleme, siralama, sayfalama) |
| POST | /api/leads | Lead olustur |
| GET | /api/leads/[id] | Lead detay |
| PATCH | /api/leads/[id] | Lead guncelle |
| DELETE | /api/leads/[id] | Lead sil |
| GET | /api/leads/[id]/activities | Lead aktivite gecmisi |
| GET | /api/leads/categories | Kategori listesi |
| POST | /api/leads/score | Toplu puanlama |
| POST | /api/leads/enrich-instagram | Instagram zenginlestirme |
| POST | /api/leads/enrich-website | Website zenginlestirme |

### Assignments
| Method | Endpoint | Aciklama |
|--------|----------|----------|
| GET | /api/assignments | Atamalari listele |
| POST | /api/assignments | Atama olustur (catisma kontrolu ile) |
| PATCH | /api/assignments?id=X | Atama guncelle |
| POST | /api/assignments/distribute | Otomatik dagitim |

### Routes
| Method | Endpoint | Aciklama |
|--------|----------|----------|
| GET | /api/routes | Rotalari listele |
| POST | /api/routes | Rota olustur/guncelle |
| GET | /api/routes/[id] | Rota detay |
| POST | /api/routes/optimize | Rota optimize et (TSP) |

### Scraper
| Method | Endpoint | Aciklama |
|--------|----------|----------|
| POST | /api/scraper | Tarama baslat |
| GET | /api/scraper | Tarama isleri listele |

### Calls
| Method | Endpoint | Aciklama |
|--------|----------|----------|
| GET | /api/calls | Arama listeleri |
| POST | /api/calls | Arama listesi olustur |
| GET | /api/calls/[id] | Arama listesi detay |
| PATCH | /api/calls/[id] | Arama listesi guncelle |

### Agents
| Method | Endpoint | Aciklama |
|--------|----------|----------|
| GET | /api/agents | Ajanlari listele |
| POST | /api/agents | Ajan olustur |
| PATCH | /api/agents | Ajan durumu guncelle (aktif/pasif) |
| GET | /api/agents/preferences | Ajan tercihlerini getir |
| PUT | /api/agents/preferences | Ajan tercihlerini guncelle |

### Weekly Plan
| Method | Endpoint | Aciklama |
|--------|----------|----------|
| GET | /api/weekly-plan | Haftalik planlari listele |
| POST | /api/weekly-plan | Haftalik plan olustur (scrapeConfigs doner) |
| DELETE | /api/weekly-plan | Stuck/failed plan sil (sifirlama) |
| GET | /api/weekly-plan/status | Plan durumunu sorgula |
| POST | /api/weekly-plan/distribute | Dagitimi tetikle (taramalar bittikten sonra) |

### Analytics
| Method | Endpoint | Aciklama |
|--------|----------|----------|
| GET | /api/analytics | Dashboard verileri |

### My (Ajan Kisisel)
| Method | Endpoint | Aciklama |
|--------|----------|----------|
| GET | /api/my/leads | Ajanin atanmis leadleri |
| GET | /api/my/calls | Ajanin arama listesi (tarih kisitlamasi yok) |
| PATCH | /api/my/calls/[lead_id] | Arama sonucu kaydet (tum tarihler) |
| GET | /api/my/route | Ajanin gunluk rotasi |
| PATCH | /api/my/route/stops/[lead_id] | Ziyaret sonucu kaydet |

### Other
| Method | Endpoint | Aciklama |
|--------|----------|----------|
| GET | /api/districts | Ilceleri listele |
| POST | /api/auth | Auth islemleri |

## UI Sayfalari

| Sayfa | Yol | Aciklama |
|-------|-----|----------|
| Admin | /admin | Haftalik plan olusturma, genel yonetim |
| Musteriler | /leads | Lead listesi (filtreleme, siralama, sayfalama) |
| Musteri Detay | /leads/[id] | 6 sekme: Bilgiler, Google, Instagram, Website, Marketing, Aktivite |
| Rotalar | /routes | Rota olusturma + harita gorunumu + ajan filtresi |
| Aramalar | /calls | Arama listeleri (admin gorunumu) + PDF/Excel export |
| Ajanlar | /agents | Ajan yonetimi + tercihler |
| Analitik | /analytics | KPI, grafikler, trend, performans |
| Ayarlar | /settings | Uygulama ayarlari |
| Arama Listem | /my/calls | Ajan kendi arama listesi + PDF/Excel export |
| Leadlerim | /my/leads | Ajanin atanmis leadleri |
| Rotam | /my/route | Ajanin gunluk rotasi + harita |

## Dagitim

- Frontend/API: Vercel
- Database: Supabase Cloud
- Region: Frankfurt (fra1)
- Auth: Supabase Auth (PKCE flow)
- Monitoring: (Sentry kaldirildi — ileride tekrar entegre edilecek)
