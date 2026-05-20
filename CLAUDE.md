# Repo Notlari

## Guncel Operasyon Modeli

- Sistem su an yalnizca telefon ajani akisinda calisir.
- Tarama manuel olarak `POST /api/scraper` ile baslatilir (varsayilan: skip_instagram=true; IG zenginlestirme arka plan cron'u ile yapilir).
- Arama listeleri manuel olarak `POST /api/calls` ile uretilir.
- Otomatik dagitim kapalidir.
- Hafta ici tum gunler `REMOTE`, hafta sonu `OFF`.
- Saha modulu kaldirildi (FIELD_AGENT rolu ve `routes` tablosu legacy olarak korunur).

## Roller

- `ADMIN`
- `TELESALES_AGENT`
- `FIELD_AGENT` (legacy, aktif degil)

Varsayilan yeni ajan rolu `TELESALES_AGENT`.

## Veritabani Kurallari

- Tum tablolar RLS ile korunur (Mayis 2026 sikilastirma: "herkes okur" kaldirildi, `authenticated` agent okuyabilir).
- `updated_at` trigger'lari korunur.
- Assignment gercegi: `UNIQUE(lead_id)` — bir lead tekrar atanmaz.
- Call list gercegi: `UNIQUE(agent_id, list_date)` — bir ajana ayni gun ikinci liste yazilmaz.
- `agents.user_id UNIQUE` constraint mevcuttur (Mayis 2026 migration; pre-flight gerekli).

## Atomicity (Postgres RPC'ler)

Cok adimli yazimlar tek transaction'da Postgres RPC'leri ile yapilir; ROLLBACK garantisi vardir:

- `create_call_list_atomic` — `/api/calls` POST
- `update_call_item_atomic` — `/api/my/calls/[lead_id]` PATCH ve `/api/calls/[id]` PATCH (FOR UPDATE row lock; lost-update riski yok)
- `acquire_assignment_lock` — `collision-guard` (race-free)
- `reset_weekly_plan_atomic` — `/api/weekly-plan` DELETE
- `reset_daily_plan_atomic` — `/api/daily-plan` DELETE

## Kritik Endpoint'ler

### Aktif

- `POST /api/scraper`
- `GET /api/scraper`
- `POST /api/calls`
- `GET /api/calls`
- `PATCH /api/calls/[id]`
- `GET /api/my/calls`
- `PATCH /api/my/calls/[lead_id]`
- `POST /api/leads/score`
- `POST /api/leads/enrich-instagram`
- `POST /api/leads/enrich-website`
- `GET /api/leads`, `GET /api/leads/[id]`, `PATCH /api/leads/[id]`, `GET /api/leads/[id]/activities`
- `GET /api/agents`, `PATCH /api/agents`, `POST /api/agents`, `DELETE /api/agents`
- `GET/PUT /api/agents/preferences`
- `GET /api/districts`
- `GET /api/analytics`
- `POST /api/auth` — yalniz ADMIN; auth + admin guard ile korunur
- `GET /api/cron/enrich-instagram` — Vercel cron (gunluk 06:00 UTC)
- `GET /api/cron/clean-expired-locks` — Vercel cron (her 30dk)
- `GET /api/weekly-plan`, `DELETE /api/weekly-plan` (atomik)
- `GET /api/weekly-plan/status` (read-only — yan etki yok)
- `DELETE /api/daily-plan` (atomik)
- `GET/POST/PATCH /api/assignments`
- `POST /api/leads/[id]/audit` — admin-only tek-lead audit (Faz 1 PR2)
- `POST /api/audit/batch` — admin-only audit batch (Faz 1 PR2; pipeline tetikler)
- `GET /api/audit/[slug]` — public no-auth audit share JSON (PII expose etmez)

### Pasif

Bu endpoint'ler `410` doner:

- `POST /api/weekly-plan`
- `POST /api/weekly-plan/distribute`
- `POST /api/daily-plan/distribute`
- `POST /api/assignments/distribute`

## UI Yuzeyi

- `/admin`: manuel tarama + manuel arama listesi olusturma + IG enrichment kontrolu + audit batch tetikleyici (Faz 1 PR2)
- `/calls`: yonetici arama listeleri gorunumu
- `/my/calls`: ajan isleme ekrani (server-replace optimistic update; lost-update yok)
- `/audit/[slug]`: public no-auth audit paylasim sayfasi (SSR, Crevia markali, mobil-uyumlu)

## Tercihler

- `agent_preferences` bos olabilir.
- Bos tercih = manuel liste uretiminde tum lead havuzu.
- Dolu tercih = ilce/kategori filtresi.

## Guvenlik / Operasyon

- `POST /api/auth` aginda anonim cagri yapilamaz; caller'in `agents.role = 'ADMIN'` olmasi sart, kendi rolunu degistiremez.
- Logger PII redaction: `phone`, `email`, `token`, `password`, `authorization` anahtarlari otomatik `***` ile maskelenir.
- `src/proxy.ts` — Next.js 16 proxy (auth + RBAC + in-memory rate limit; `/api/scraper`, `/api/calls`, `/api/leads/enrich-*`, `/api/auth`, `/api/audit/*` icin sikilastirilmis kotalar).
- Cron endpoint'leri `CRON_SECRET` env var ile korunur (Vercel cron'lari header'i otomatik gonderir).

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
| `CRON_SECRET` | Vercel cron yetkilendirme |
| `LOCK_DURATION_MINUTES` (ops) | Assignment lock TTL (default 30) |
| `INSTAGRAM_WEBSITE_FETCH_TIMEOUT_MS` (ops) | IG discovery website fetch timeout (default 10000) |
| `ROUTE_URBAN_ROAD_FACTOR`, `ROUTE_AVERAGE_VISIT_DURATION_MIN`, `ROUTE_MAX_DAILY_STOPS`, `ROUTE_MIN_DAILY_STOPS` (ops) | Legacy `route-optimizer` parametreleri — yalnizca pasif `weekly-distributor` ve testler tarafindan okunur |

## Migration Notlari

- Migration sirasi: `supabase/migrations/` icindeki dosyalar timestamp'e gore uygulanir.
- `20260504000006_unique_agent_user_id.sql` icin pre-flight gerekli:
  ```sql
  SELECT user_id, count(*) FROM agents
  WHERE user_id IS NOT NULL
  GROUP BY user_id HAVING count(*) > 1;
  ```
  0 satir donerse migration guvenle uygulanir.

## Kalite Kontrolleri

```bash
npm run typecheck
npm run lint
npm run test
```

`npm run build` artik `prebuild` ile otomatik typecheck + lint calistirir; tip hatasi varsa prod build engellenir.
