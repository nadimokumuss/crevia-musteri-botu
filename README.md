# Crevia Sales OS

Crevia Sales OS, Istanbul'daki isletmeleri tarayip dijital ihtiyac puani ureten ve bu lead'leri telefon ajani ekiplerine yoneten bir satis operasyon uygulamasidir.

## Guncel Isletim Modeli

- Sistem su an **yalnizca TELESALES_AGENT** akisinda calisir.
- **Tarama manuel** baslatilir: admin `/admin` ekranindan veya `POST /api/scraper` ile is tetikler.
- **Dagitim manuel** yapilir: admin belirli ajan ve tarih icin `POST /api/calls` ile arama listesi uretir.
- **Otomatik dagitim kapali**dir. Legacy endpoint'ler (`/api/weekly-plan` POST, `/api/weekly-plan/distribute`, `/api/daily-plan/distribute`, `/api/assignments/distribute`) `410` doner.
- **Tekrar atama kapali**dir. Bir lead herhangi bir assignment aldiginda yeniden listeye giremez. Veritabani gercegi: `UNIQUE(lead_id)`.
- **Hafta ici her gun REMOTE**, hafta sonu `OFF`.

## Temel Akis

### 1. Manuel tarama

1. Admin ilce, kategori, kaynak ve limit secer.
2. `POST /api/scraper` scrape job kaydi olusturur.
3. Kayitlar `leads` tablosuna **3 grupta toplu upsert** edilir (N+1 sorgu yok):
   - `google_place_id` olanlar
   - sadece `ig_username` olanlar
   - ikisi de olmayanlar
4. Tarama sonrasi need score alanlari paralel hesaplanir.
5. IG enrichment varsayilan olarak atlanir; kuyruk cron ile islenir.

### 2. Manuel arama listesi

1. Admin telefon ajanini ve tarihi secer.
2. `POST /api/calls`:
   - aktif telefon ajanini dogrular
   - ajanin ilce/kategori tercihlerini okur
   - telefonu olan ve daha once hic assignment almamis lead'leri secer
   - `need_score` azalan sirada liste uretir
   - `create_call_list_atomic` RPC ile **tek transaction'da** `call_lists` + `assignments` + `lead_activities` yazar (UNIQUE cakismasi olursa otomatik ROLLBACK)
3. Ajan `/my/calls` ekranindan sonucu isler.
4. `update_call_item_atomic` RPC `call_lists.items` JSONB'sini, `assignments.status`'unu ve `lead_activities` log'unu **lost-update riski olmadan** (`FOR UPDATE` row lock) tek transaction'da yazar.

## Roller

- `ADMIN`: genel yonetim, tarama, manuel liste olusturma, analitik, ajan yonetimi
- `TELESALES_AGENT`: kendi arama listeleri ve kendi lead gorunumleri (varsayilan rol)
- `FIELD_AGENT`: enum olarak korunur fakat aktif akista kullanilmaz

## Mimari

### Uygulama

- `Next.js 16` App Router
- `Supabase` veritabani + auth + Postgres RPC (atomicity)
- `Zod` ile input dogrulama (strict takvim tarihi vb.)
- `Vitest` ile unit/integration testleri (195+ test)
- Vercel `src/middleware.ts` — basit in-memory rate limit

### Klasorler

- `src/core`: saf is kurallari
- `src/infra`: Supabase ve harici adapter'ler
- `src/app`: App Router sayfalari ve API route'lari
- `src/lib`: validator, logger (PII redaction), errors, sabitler, tarih yardimcilari
- `src/components/ui/instagram-link.tsx`: shared IG link bilesen
- `tests`: unit ve integration testleri
- `supabase/migrations`: DDL ve RPC tanimlari

### One Cikan Moduller

- `src/core/scoring/need-score.ts`: 4 sutunlu ihtiyac puani algoritmasi (Instagram `dead` sinyali dahil)
- `src/core/routing/call-list-generator.ts`: tercihli lead secimi ve arama listesi uretimi
- `src/core/assignment/collision-guard.ts`: RPC tabanli race-free assignment kilidi
- `src/app/api/calls/route.ts`: atomik manuel arama listesi olusturma
- `src/app/api/my/calls/[lead_id]/route.ts`: atomik ajan sonuc girisi (server-replace optimistic UI)
- `src/lib/logger.ts`: PII redaction + `withContext` child logger

## Veri Modeli

Ana tablolar:

- `districts`
- `agents` (`UNIQUE(user_id)` Mayis 2026)
- `agent_preferences`
- `leads` (`UNIQUE(google_place_id)`)
- `scrape_jobs`
- `call_lists` (`UNIQUE(agent_id, list_date)`)
- `assignments` (`UNIQUE(lead_id)`)
- `lead_activities`
- `weekly_plans` (legacy plan/sifirlama kayitlari)
- `routes` (legacy tablo; API yuzeyi kaldirildi)

RLS aktif: Mayis 2026'dan itibaren "herkes okur" politikalari kaldirildi; `authenticated` aktif agent'lar okuyabilir.

## Need Score

Toplam puan 0-100 arasi hesaplanir:

- Google: 0-30
- Instagram: 0-30
- Website: 0-30
- Marketing: 0-20

Yuksek puan = Crevia hizmetine daha fazla ihtiyac.

Oneri esikleri:

- `65-100` → `HIGH_PRIORITY`
- `40-64` → `MEDIUM`
- `15-39` → `LOW_PRIORITY`
- `0-14` → `SKIP`

Detay: [docs/scoring-algorithm.md](docs/scoring-algorithm.md)

## Aktif API Yuzeyi

- `POST /api/scraper` — manuel tarama (varsayilan `skip_instagram=true`)
- `GET /api/scraper` — son scrape job'lari
- `POST /api/calls` — atomik arama listesi olustur
- `GET /api/calls` — arama listelerini getir
- `PATCH /api/calls/[id]` — atomik admin guncellemesi
- `GET /api/my/calls` — ajanin kendi listesi
- `PATCH /api/my/calls/[lead_id]` — atomik arama sonucu guncelleme
- `POST /api/leads/score` — toplu puanlama
- `POST /api/leads/enrich-instagram` — IG kesif kuyrugunu tek seferde isle
- `POST /api/leads/enrich-website` — PageSpeed analizi + rescore (paralel, concurrency-limited)
- `GET /api/leads`, `GET/PATCH /api/leads/[id]`, `GET /api/leads/[id]/activities`
- `GET/POST/PATCH /api/assignments`
- `GET/POST/PATCH/DELETE /api/agents`, `GET/PUT /api/agents/preferences`
- `GET /api/districts`, `GET /api/analytics`
- `POST /api/auth` — ADMIN guard ile rol guncelleme (caller kendi rolunu degistiremez)
- `GET /api/weekly-plan`, `DELETE /api/weekly-plan` (atomik)
- `GET /api/weekly-plan/status` (read-only)
- `DELETE /api/daily-plan` (atomik)
- `GET /api/cron/enrich-instagram` (Vercel cron, gunluk 06:00 UTC)
- `GET /api/cron/clean-expired-locks` (Vercel cron, her 30dk)

## Pasif Legacy Yuzeyler

- `POST /api/weekly-plan`
- `POST /api/weekly-plan/distribute`
- `POST /api/daily-plan/distribute`
- `POST /api/assignments/distribute`

Bu endpoint'ler `410` doner; yeni veri uretmez.

## Gelistirme

```bash
npm install
npm run dev
```

Kalite kontrolleri:

```bash
npm run typecheck
npm run lint
npm run test
```

`npm run build` artik `prebuild` ile otomatik typecheck + lint calistirir; tip hatasi varsa prod build engellenir.

Deploy hook ile deploy tetikleme:

1. Vercel proje ayarlarindan `Deploy Hooks` altinda `main` branch icin bir hook olustur.
2. Hook URL'ini yerel `.env.local` dosyasina ekle:

```bash
VERCEL_DEPLOY_HOOK_URL=https://api.vercel.com/v1/integrations/deploy/...
```

3. Terminalden deploy'u tetikle:

```bash
npm run deploy:vercel
```

## Konfigurasyon (env)

| Var | Amac |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase istemci |
| `SUPABASE_SERVICE_ROLE_KEY` | RLS bypass eden server-side cagrilar |
| `GOOGLE_PLACES_API_KEY` | Google Places scraper |
| `APIFY_API_TOKEN` | Apify + Instagram scraper |
| `OUTSCRAPER_API_KEY` | Outscraper Google Business Profile reviews (Faz 1) |
| `ANTHROPIC_API_KEY` | Sonnet 4.6 audit synthesis (Faz 1 PR2) |
| `MAX_DAILY_AUDIT_BUDGET_USD` (ops) | Audit batch maksimum dolar butcesi (default 20) |
| `NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_ORG`, `SENTRY_PROJECT`, `SENTRY_AUTH_TOKEN` | Sentry |
| `CRON_SECRET` | Vercel cron yetkilendirme (zorunlu) |
| `LOCK_DURATION_MINUTES` (ops) | Assignment lock TTL (default 30) |
| `INSTAGRAM_WEBSITE_FETCH_TIMEOUT_MS` (ops) | IG discovery website fetch timeout (default 10000) |
| `ROUTE_URBAN_ROAD_FACTOR`, `ROUTE_AVERAGE_VISIT_DURATION_MIN`, `ROUTE_MAX_DAILY_STOPS`, `ROUTE_MIN_DAILY_STOPS` (ops) | Legacy `route-optimizer` parametreleri — yalnizca pasif `weekly-distributor` ve testler tarafindan okunur |

## Migration Notlari (Mayis 2026)

Yeni 6 migration eklendi:

| Dosya | Ne yapar |
|---|---|
| `20260504000001_create_call_list_atomic.sql` | RPC: atomik call list olusturma |
| `20260504000002_update_call_item_atomic.sql` | RPC: atomik arama sonucu guncelleme |
| `20260504000003_acquire_assignment_lock.sql` | RPC: race-free assignment kilidi |
| `20260504000004_reset_plan_atomic.sql` | RPC: atomik weekly + daily plan reset |
| `20260504000005_tighten_rls_and_indexes.sql` | RLS sikilastirma + eksik index'ler |
| `20260504000006_unique_agent_user_id.sql` | `agents.user_id UNIQUE` (pre-flight gerekli) |

`20260504000006` icin pre-flight:

```sql
SELECT user_id, count(*) FROM agents
WHERE user_id IS NOT NULL
GROUP BY user_id HAVING count(*) > 1;
```

0 satir donerse migration guvenle uygulanir.

## Operasyon Notlari

- Varsayilan ajan rolu `TELESALES_AGENT` olarak ayarlanmistir.
- Telefonu olmayan lead'ler arama listesine girmez.
- Mevcut bir ajan/tarih listesi uzerine sessiz overwrite yapilmaz.
- Instagram kesif kuyrugu admin ekranindan tek tikla calistirilabilir; kalan detay backfill'i Hobby plan uyumlu gunluk Vercel cron ile tamamlanir.
- Saha modulu API yuzeyi kaldirildi; `routes` tablosu DB'de korunur (ileride saha modulu geri acilirsa migrasyon gerekir).
- Pahalı endpoint'ler middleware'de rate limit'lidir (scraper: 5/dk, calls: 30/dk, enrichment: 5/dk, auth: 10/dk).
