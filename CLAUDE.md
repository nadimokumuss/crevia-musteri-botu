# Crevia Sales OS

Istanbul merkezli kreatif ajans Crevia icin B2B satis platformu.

## Bash commands
- `npm run dev`: Gelistirme sunucusu
- `npm run build`: Projeyi derle
- `npm run typecheck`: TypeScript tip kontrolu
- `npm run test`: Tum testleri calistir
- `npm run lint`: ESLint

## Code style
- ES modules (import/export) kullan, CommonJS (require) degil
- Mumkun oldugunda destructured import kullan: `import { foo } from 'bar'`
- Yapilandirilmis logger kullan (`src/lib/logger.ts`), dogrudan `console.log` YASAK
- Hata sinif hiyerarsisini kullan (`src/lib/errors.ts`)
- Zod semalarini dogrulama icin kullan (`src/lib/validators.ts`)
- UI dili: Turkce (Istanbul merkezli ekip)

## Architecture
- **src/core/**: Saf is mantigi (I/O YOK) - scoring, routing, assignment, scheduler
- **src/infra/**: Dis adaptorler (I/O siniri) - supabase, scrapers, maps, website, auth
- **src/lib/**: Paylasilan yardimcilar (logger, errors, constants, validators, utils, rate-limiter, signal-builders, instagram-utils)
- **src/hooks/**: React hook'lari (useCurrentUser, useRealtime)
- **src/components/**: React UI bilesenleri (shadcn/ui tabanli)
- **src/types/**: Paylasilan TypeScript tipleri (9 dosya)

## Key patterns
- Adaptor deseni: ILeadSource, IMapProvider arayuzleri ile bagimlilik ters cevirme
- Factory deseni: `scraper-factory.ts` ile calisma zamani adaptor secimi (google-places, apify, instagram)
- Catisma onleme: `assignments` tablosunda UNIQUE kisitlamasi + kilit mekanizmasi
- Otomatik puanlama: Tarama sonrasi lead'ler aninda puanlanir (`scraper/route.ts` icinde `autoScoreLeads`)
- Instagram zenginlestirme: Website/isletme adindan IG kullanici adi tahmini + Apify profil analizi
- Aktivite loglama: `logLeadActivity()` ile fire-and-forget audit trail (hata durumunda sadece logger, ana islemi bloklamamali)
- Otomatik agent_preferences: Ajan olusturuldiginda bos tercih kaydi otomatik eklenir, tercihsiz ajan = tum lead'lere acik
- Tercih uyari banner: Ajan sayfalari tercih yoksa uyari gosterir (`preferences-banner.tsx`)
- Gunluk dagitim: Admin her gun "Bugunu Dagit" butonuyla sadece bugun icin atama olusturur. Tarama ve dagitim bagimsiz islemler
- Tarama bagimsiz: Lead tarama istenen zaman yapilabilir, dagitimdan bagimsiz calisir. `POST /api/weekly-plan?mode=scan` weekly_plans tablosuna YAZMAZ, sadece config uretir
- Genis tarama: Kategori-spesifik + genel (kategorisiz) tarama ile lead havuzu genisletilir. Ajan ihtiyacina gore dinamik limit hesaplanir (scrape job basina min 60 lead, toplam ihtiyacin 1.5x'i)
- Google Places pagination: Per-request max 20 sonuc, nextPageToken ile devam. Limit parametresi ile coklu sayfa cekilir
- Iki gecisli dagitim: Pass 1 tercih eslesen lead'ler, Pass 2 TUM ajanlara kalan lead'ler (kalan kapasite kadar, round-robin)
- Role-aware call dagitim: FIELD ajanlar remoteDays'de, TELESALES ajanlar tum hafta ici gunlerde arama alir
- Kategori exact match: `.includes()` degil `===` ile birebir eslesme
- Dagitim assignments yazar: routes + call_lists + assignments tablolarina kayit olusturur
- Gunluk sifirlama: Belirtilen gunun assignments + routes + call_lists + weekly_plans kayitlarini temizler
- Plan sifirlama: weekly_plan + assignments + routes + call_lists + scrape_jobs hepsini temizler
- Tekrar dagitim onleme: Ayni lead farkli tarihlere tekrar atanamaz
- Rate limiting: Scraper adaptorlerinde API cagri hiz kontrolu (RateLimiter + exponential backoff, `src/lib/rate-limiter.ts`)
- Signal builders: Lead'den puanlama sinyalleri cikarma (`src/lib/signal-builders.ts`), kod tekrarini onler

## Database
- Supabase (PostgreSQL + Auth + Realtime + RLS)
- Migrations: `supabase/migrations/` (15 dosya)
- 10 tablo: districts, leads, agents, assignments, routes, scrape_jobs, call_lists, lead_activities, agent_preferences, weekly_plans
- leads tablosu: 4-sutunlu puanlama (google 0-30, instagram 0-30, website 0-30, marketing 0-20)
- lead_activities tablosu: Kronolojik audit trail (STATUS_CHANGE, ASSIGNMENT_CREATED/UPDATED, CALL_LOGGED, VISIT_LOGGED, SCORE_CALCULATED, NOTE_ADDED, LEAD_CREATED)
- agent_preferences tablosu: Ajan ilce + kategori tercihleri
- weekly_plans tablosu: Haftalik plan durumu + tarama isleri + dagitim istatistikleri
- assignments tablosunda agents'e IKI FK var (agent_id + locked_by) — join'lerde `agents!agent_id` ile disambiguate et

## API endpoints

### Leads
- `GET /api/leads` — Lead listele (filtreleme, siralama, sayfalama)
- `POST /api/leads` — Lead olustur (+ LEAD_CREATED aktivite logu)
- `GET /api/leads/[id]` — Lead detay
- `PATCH /api/leads/[id]` — Lead guncelle (+ STATUS_CHANGE / NOTE_ADDED aktivite logu)
- `DELETE /api/leads/[id]` — Lead sil
- `GET /api/leads/[id]/activities` — Lead aktivite gecmisi
- `GET /api/leads/categories` — Kategori listesi
- `POST /api/leads/score` — Toplu puanlama (+ SCORE_CALCULATED aktivite logu)
- `POST /api/leads/enrich-instagram` — Instagram zenginlestirme
- `POST /api/leads/enrich-website` — Website zenginlestirme

### Assignments
- `GET /api/assignments` — Atamalari listele
- `POST /api/assignments` — Atama olustur (+ ASSIGNMENT_CREATED aktivite logu)
- `PATCH /api/assignments` — Atama guncelle (+ ASSIGNMENT_UPDATED aktivite logu)
- `POST /api/assignments/distribute` — Otomatik dagitim

### Routes
- `GET /api/routes` — Rotalari listele (tarih/ajan filtresi)
- `POST /api/routes` — Rota olustur/guncelle
- `GET /api/routes/[id]` — Rota detay
- `POST /api/routes/optimize` — Rota optimize et (TSP)

### Scraper
- `POST /api/scraper` — Tarama baslat (otomatik puanlama dahil)
- `GET /api/scraper` — Tarama isleri listele

### Calls
- `GET /api/calls` — Arama listeleri
- `POST /api/calls` — Arama listesi olustur
- `GET /api/calls/[id]` — Arama listesi detay
- `PATCH /api/calls/[id]` — Arama listesi guncelle

### Agents
- `GET /api/agents` — Ajanlari listele
- `POST /api/agents` — Ajan olustur
- `PATCH /api/agents` — Ajan durumu guncelle (aktif/pasif)
- `GET /api/agents/preferences` — Ajan tercihlerini getir
- `PUT /api/agents/preferences` — Ajan tercihlerini guncelle

### Daily Plan (Gunluk Dagitim)
- `POST /api/daily-plan/distribute` — Gunluk dagitim (bugun icin atama olustur, force: true ile yeniden dagit)
- `DELETE /api/daily-plan?date=YYYY-MM-DD` — Belirtilen gunun dagitimini sifirla

### Weekly Plan (Tarama)
- `GET /api/weekly-plan` — Haftalik planlari listele
- `POST /api/weekly-plan` — Haftalik plan olustur (scrapeConfigs doner, scraper CAGIRMAZ). `?mode=scan` ile weekly_plans'a YAZMAZ, sadece config uretir (tekrar calistirilabilir)
- `DELETE /api/weekly-plan` — Stuck/failed plan sil (sifirlama)
- `GET /api/weekly-plan/status` — Plan durumunu sorgula (sadece scrape progress)
- `POST /api/weekly-plan/distribute` — Haftalik dagitimi tetikle (legacy, gunluk dagitim tercih edilmeli)

### Analytics
- `GET /api/analytics` — Dashboard verileri (KPI, funnel, trend, performans)

### My (Ajan Kisisel)
- `GET /api/my/leads` — Ajanin atanmis leadleri
- `GET /api/my/calls` — Ajanin arama listesi (tarih filtresi, tarih kisitlamasi yok)
- `PATCH /api/my/calls/[lead_id]` — Arama sonucu kaydet, tum tarihler guncellenebilir (+ CALL_LOGGED aktivite logu)
- `GET /api/my/route` — Ajanin gunluk rotasi
- `PATCH /api/my/route/stops/[lead_id]` — Ziyaret sonucu kaydet (+ VISIT_LOGGED aktivite logu)

### Other
- `GET /api/districts` — Ilceleri listele
- `POST /api/auth` — Auth islemleri

## Weekly schedule (role-based)
### FIELD_AGENT (haftalik 50 isletme)
- Pazartesi-Cuma: FIELD — 10 saha ziyareti/gun (telefon aramasi YOK)

### TELESALES_AGENT (haftalik 100 isletme)
- Pazartesi-Cuma: REMOTE — 20 arama/gun

### Dagitim sabitleri
- `DAILY_CALL_TARGET = 35` — TELESALES ajanlarin gunluk arama hedefi
- `MAX_DAILY_VISITS = 10` — saha ajanlarinin gunluk ziyaret limiti (agent.maxDailyVisits)

## Workflow
- Kod degisikliklerinden sonra `npm run typecheck` calistir
- Performans icin tek test calistirmayi tercih et
- Yeni adaptorler ILeadSource veya IMapProvider arayuzunu uygulasin
- **Her git push oncesi**: README.md, docs/ ve CLAUDE.md dosyalarini guncel tut
