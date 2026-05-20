# Mimari Ozeti

## Sistem Ozeti

Crevia Sales OS su anda manuel yonetilen bir telesales operasyon sistemi olarak calisir.

- Tarama manuel baslatilir.
- Arama listeleri manuel olusturulur.
- Hafta ici tum gunler `REMOTE`, hafta sonu `OFF`.
- Saha/rota akisi ve otomatik dagitim pasiftir.

## Katmanlar

### `src/core`

Saf fonksiyonlar:

- `scoring/need-score.ts`
- `routing/call-list-generator.ts`
- `routing/geo-cluster.ts`
- `routing/route-optimizer.ts` (legacy ama testli)
- `assignment/distributor.ts`
- `assignment/collision-guard.ts` (acquireLock artik RPC tabanli, race-free)
- `scheduler/weekly-planner.ts`

### `src/infra`

I/O adapter'leri:

- Supabase client'lari
- scraper adapter'leri (Apify `locationQuery` ilçe adi gönderir; UUID değil)
- website/PageSpeed adapter'leri
- activity log yazimi (`logLeadActivity` artik tum cagrilarda await'lenir)

### `src/app`

- dashboard sayfalari
- App Router API route'lari
- auth ve middleware (`src/middleware.ts` — in-memory rate limit)

### `src/lib`

- validator'ler (`isoDateString` strict takvim doğrulamasi yapar)
- logger (PII redaction otomatik; `withContext` ile child logger)
- sabitler (env'den override edilebilir)
- tarih yardimcilari
- signal builder'lar
- errors (`toClientErrorMessage` ile guvenli response mesaji)

## Atomicity (Postgres RPC katmani)

Cok adimli yazimlar tek transaction'da Postgres RPC'leri ile yapilir; herhangi bir adim fail ederse otomatik ROLLBACK.

| RPC | Kullanim |
|---|---|
| `create_call_list_atomic` | `/api/calls` POST — call_list + assignments + activity log |
| `update_call_item_atomic` | `/api/my/calls/[lead_id]` PATCH ve `/api/calls/[id]` PATCH — JSONB items + assignment status + log; `FOR UPDATE` row lock ile lost-update yok |
| `acquire_assignment_lock` | `collision-guard.acquireLock` — UNIQUE(lead_id) + FOR UPDATE birlesik race-free akis |
| `reset_weekly_plan_atomic` | `/api/weekly-plan` DELETE — 5 tablo silme tek transaction |
| `reset_daily_plan_atomic` | `/api/daily-plan` DELETE — 4 tablo silme tek transaction |

## Aktif Veri Akisi

### 1. Manuel tarama

1. Admin `/admin` ekraninda ilce, kaynak ve kategori secer.
2. `POST /api/scraper` scrape job kaydi olusturur.
3. Adapter harici kaynaktan isletmeleri toplar.
4. `leads` tablosuna 3 grupta toplu upsert (N+1 yok): `google_place_id` olanlar, sadece `ig_username` olanlar, ikisi de olmayanlar.
5. Otomatik puanlama paralel calisir.
6. IG enrichment varsayilan olarak atlanir (`skip_instagram=true`); kalan kuyruk gunluk cron ile islenir.

### 2. Manuel arama listesi

1. Admin ajan ve tarih secer.
2. `POST /api/calls`:
   - ajanin aktif ve `TELESALES_AGENT` oldugunu dogrular
   - `agent_preferences` kaydini okur
   - daha once assignment almamis lead'leri filtreler
   - ihtiyac skoruna gore liste olusturur
   - `create_call_list_atomic` RPC ile tek transaction'da `call_lists` + `assignments` + `lead_activities` yazar
3. Ajan `/my/calls` ekraninda sonucu gunceller (server-replace optimistic update).
4. `update_call_item_atomic` RPC ile `assignments.status` ve `lead_activities` senkronize edilir.

## Yetki ve Erisim

Roller:

- `ADMIN`
- `TELESALES_AGENT` (varsayilan)
- `FIELD_AGENT` (legacy)

Yetki kontrolleri:

- UI erisimi `core/auth/access-control` + middleware ile
- API route erisimi server-side `auth.getUser()` + `agents.role` lookup ile
- `/api/auth` endpoint'i ADMIN guard ile korunur (kendi rolunu degistiremez)
- veritabani tarafinda RLS aktif; "herkes okur" politikalari `authenticated` kullaniciya dustu (Mayis 2026)

## Veritabani Tablolari

### `leads`

Tarama ile gelen tum isletme kayitlari, skorlar ve operasyon durumu.

- `UNIQUE(google_place_id)` — duplicate detection
- `idx_leads_created_at` (Mayis 2026) — pagination icin

### `assignments`

Her lead icin tek assignment kaydi tutulur.

Kritik kural:

- `UNIQUE(lead_id)`

Sonuc:

- bir lead tekrar atanmaz
- yeni manuel liste yalnizca hic atanmamis lead'lerden uretilir
- `idx_assignments_agent_scheduled` (Mayis 2026)

### `call_lists`

Ajan + tarih bazli JSONB item listeleri.

- `UNIQUE(agent_id, list_date)`
- `idx_call_lists_items_gin` GIN index (JSONB containment sorgulari icin)

### `agents`

- `UNIQUE(user_id)` (Mayis 2026 — pre-flight gerekli)

### `agent_preferences`

Manuel call listesi uretiminde opsiyonel ilce/kategori filtresi.

### `scrape_jobs`

Tarama calisma kayitlari ve istatistikleri.

### `lead_activities`

Tum aktivite log'u.

- `idx_lead_activities_lead_created` (Mayis 2026)

### `weekly_plans` ve `routes`

Legacy veri yapilari.

- `weekly_plans`: eski plan/sifirlama kayitlari
- `routes`: saha modulu kapali oldugu icin yeni kayit uretmez

## API Yuzeyi

### Aktif endpoint'ler

- `POST /api/scraper`, `GET /api/scraper`
- `POST /api/calls`, `GET /api/calls`, `PATCH /api/calls/[id]`
- `GET /api/my/calls`, `PATCH /api/my/calls/[lead_id]`
- `POST /api/leads/score`
- `POST /api/leads/enrich-instagram`
- `POST /api/leads/enrich-website`
- `GET /api/leads`, `GET/PATCH /api/leads/[id]`, `GET /api/leads/[id]/activities`
- `GET/POST/PATCH /api/assignments`
- `GET /api/agents`, `POST /api/agents`, `PATCH /api/agents`, `DELETE /api/agents`
- `GET/PUT /api/agents/preferences`
- `GET /api/districts`, `GET /api/analytics`
- `POST /api/auth` (ADMIN guard)
- `GET /api/weekly-plan`, `DELETE /api/weekly-plan`, `GET /api/weekly-plan/status` (read-only)
- `DELETE /api/daily-plan`
- `GET /api/cron/enrich-instagram` (Vercel cron)
- `GET /api/cron/clean-expired-locks` (Vercel cron)

### Pasif endpoint'ler

Bu endpoint'ler `410` doner:

- `POST /api/weekly-plan`
- `POST /api/weekly-plan/distribute`
- `POST /api/daily-plan/distribute`
- `POST /api/assignments/distribute`
- `GET/POST /api/routes`
- `PATCH /api/routes/[id]`
- `POST /api/routes/optimize`
- `GET /api/my/route`
- `PATCH /api/my/route/stops/[lead_id]`

## Operasyonel Katman

- **Rate limit:** `src/middleware.ts` in-memory bucket (IP + path basli):
  - `/api/scraper`: 5/dk
  - `/api/calls`: 30/dk
  - `/api/leads/enrich-*`, `/api/leads/score`: 5/dk
  - `/api/auth`: 10/dk
  - genel `/api/*`: 200/dk
- **Cron:**
  - `0 6 * * *` → IG enrichment backfill
  - `*/30 * * * *` → expired lock cleanup
  - Her ikisi `CRON_SECRET` ile korunur
- **Sentry:** logger PII redaction sonrasi context gonderir; `withContext()` ile request bazli child logger uretilebilir.

## Takvim

- Pazartesi-Cuma: `REMOTE`
- Cumartesi-Pazar: `OFF`

`weekly-planner` artik bu takvimi tek kaynak olarak kullanir.

## Test Kapsami

- scoring algoritmasi (Instagram `dead` dahil)
- call list secimi
- clustering
- route optimizer
- assignment distributor
- schedule hesaplari
- scraper adapter entegrasyonu (Apify `locationQuery` testi dahil)
- validator strict takvim
- geo NaN guard
- Instagram regex strict

Calistirma:

```bash
npm run typecheck
npm run lint
npm run test
```
