# Mayıs 2026 — Atomicity, Güvenlik, Performans Yenilemesi

Bu sürüm 9 fazda yapılan kapsamlı bug düzeltme + sıkılaştırma çalışmasıdır. ~70 alt madde, 6 yeni migration.

## Faz 0 — Güvenlik

- `POST /api/auth` artık ADMIN guard ile korunur; anonim çağrı veya non-admin agent 401/403 döner. Caller kendi rolünü değiştiremez.
- `src/lib/logger.ts` PII redaction ekledi: `password`, `token`, `secret`, `phone`, `email`, `authorization` anahtarları otomatik `***` ile maskelenir.
- `src/infra/scrapers/apify.adapter.ts` error mesajlarında body sızdırması kapatıldı (token leak riski).

## Faz 1 — Atomicity (5 yeni Postgres RPC)

| RPC | Endpoint | Garanti |
|---|---|---|
| `create_call_list_atomic` | `POST /api/calls` | call_list + assignments + activity log tek transaction; UNIQUE çakışmasında otomatik ROLLBACK |
| `update_call_item_atomic` | `PATCH /api/my/calls/[lead_id]`, `PATCH /api/calls/[id]` | JSONB items + assignment status + log; `FOR UPDATE` row lock ile lost-update yok |
| `acquire_assignment_lock` | `collision-guard` | UNIQUE(lead_id) + FOR UPDATE; race-free |
| `reset_weekly_plan_atomic` | `DELETE /api/weekly-plan` | 5 tablo silme tek transaction |
| `reset_daily_plan_atomic` | `DELETE /api/daily-plan` | 4 tablo silme tek transaction |

`/api/weekly-plan/status` GET artık pure read-only (UPDATE yan etkisi kaldırıldı). `/api/assignments` PATCH `COMPLETED`/`CANCELLED` durumunda lock release eder.

## Faz 2 — Hata yönetimi

- 7+ yerde `await` eklendi (`logLeadActivity` artık fire-and-forget değil).
- `.single()` → `.maybeSingle()` taraması (lookup'larda hata yutma kaldırıldı).
- `src/lib/errors.ts` → `toClientErrorMessage()`, `toClientErrorStatus()` helper'ları (response sanitization).

## Faz 3 — Performans

- `/api/scraper` N+1 → 3 grupta toplu upsert (`google_place_id` / `ig_username` / diğer).
- IG enrichment senkron loop → concurrency-limited paralel (default 5). `skip_instagram` artık varsayılan `true`.
- `/api/leads/enrich-website` 2x UPDATE → tek UPDATE; concurrency-limited paralel (default 3).
- `/api/leads?call_status=` in-memory tarama → JSONB containment + GIN index.
- Scraper dual-write fallback'i kaldırıldı (migration sonrası ölü kod).

## Faz 4 — DB sıkılaştırma

- RLS: 4 tablodaki "herkes okur" politikaları `authenticated` aktif agent kontrolüne dönüştürüldü (`leads`, `agents`, `districts`, `scrape_jobs`).
- 4 yeni index: `leads.created_at`, `lead_activities(lead_id, created_at DESC)`, `assignments(agent_id, scheduled_date DESC)`, `call_lists.items GIN`.
- `agents.user_id UNIQUE` constraint (pre-flight gerekli).

## Faz 5 — Validation & data integrity

- `isoDateString` strict takvim doğrulaması (`2026-13-99` gibi geçersiz tarihler artık reddedilir).
- `haversineDistance` NaN/Infinity/sınır dışı koordinat input'una `ValidationError` fırlatır.
- Instagram regex sıkılaştı: `instagram.com/_invalid` artık yakalanmaz (başta-sonda alphanumeric şart).
- **KRİTİK BUG:** `apify.adapter.ts:65` `locationQuery` parametresine UUID yerine ilçe adı gönderiliyor (örn `"Kadıköy, İstanbul, Türkiye"`); önceden Apify scraper'ı muhtemelen boş veya yanlış lokasyon döndürüyordu.
- Instagram `dead` durumu için `+5` puan eklendi (3+ ay sessiz hesaplar).
- `LOCK_DURATION_MINUTES`, `INSTAGRAM_WEBSITE_FETCH_TIMEOUT_MS`, `ROUTE_*` env'den override edilebilir.

## Faz 6 — UI

- `/my/calls` server-replace optimistic update (PATCH response items'ı authoritative; lost-update gizlenmez).
- Type cast'ler kaldırıldı (`status as CallStatus` yerine literal union typed).
- Hydration safety: `getTodayDateInIstanbul` `useEffect`'te set edilir (SSR/client mismatch yok).
- `InstagramLink` shared component'e taşındı (`src/components/ui/instagram-link.tsx`); a11y için `role="img"` + `aria-label`.
- `package.json` → `prebuild` typecheck + lint (kırık tip ile prod build engellenir).

## Faz 7 — Test

195 test geçer durumda (önceden 174):

- `geo-utils` NaN guard
- Instagram regex strict edge case'leri
- Scoring `dead` durumu
- `validators` strict takvim
- **Apify adapter** locationQuery testleri (UUID değil, ilçe adı)

## Faz 8 — Operasyonel

- `src/middleware.ts` — basit in-memory rate limit (IP + path bucket'lı):
  - `/api/scraper`: 5/dk
  - `/api/calls`: 30/dk
  - `/api/leads/enrich-*`, `/api/leads/score`: 5/dk
  - `/api/auth`: 10/dk
  - genel `/api/*`: 200/dk
- Yeni cron: `GET /api/cron/clean-expired-locks` (`*/30 * * * *`).
- `CRON_SECRET` env var ile cron endpoint'leri korunur.
- Logger `withContext()` helper'ı (request bazlı child logger).

## Yapılması Gerekenler (Deploy Öncesi)

1. **Migration uygula** (timestamp sırasıyla otomatik):
   ```bash
   supabase db push
   ```
2. **`agents.user_id` pre-flight kontrolü** (`20260504000006` öncesi):
   ```sql
   SELECT user_id, count(*) FROM agents
   WHERE user_id IS NOT NULL
   GROUP BY user_id HAVING count(*) > 1;
   ```
   0 satır dönerse güvenli; satır dönerse manuel temizlik gerek.
3. **Vercel env vars:**
   - `CRON_SECRET` (rastgele uzun string)
4. **Yeniden deploy** (env var'ın aktive olması için).

## Bilinçli Atlananlar

- `noUncheckedIndexedAccess` strict mode (kademeli refactor gerek)
- Idempotency key tablosu (UNIQUE constraint'ler zaten retry-safe)
- Upstash Redis rate limit (in-memory yeterli temel koruma)
- `schema-fallback.ts` temizliği (migration durumu prod'da doğrulanmadan riskli)
- DST timezone "bug"u (yanlış pozitif — Türkiye 2016'dan beri DST kullanmıyor)
