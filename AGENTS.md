# Crevia Sales OS - Agent Talimatları

## Genel Kurallar
- Türkçe UI metinleri kullan
- `console.log` yerine `src/lib/logger.ts` kullan (PII redaction otomatik)
- Saf fonksiyonları `src/core/` altında, I/O yapan kodları `src/infra/` altında tut
- Tüm dış veri Zod ile doğrulansın (`src/lib/validators.ts`)
- RLS politikalarını atlatma; service role yalnız sunucu tarafında kullan
- Çok adımlı veritabanı yazımı için Postgres RPC kullan (transaction + ROLLBACK)
- API route'larında `.single()` yerine `.maybeSingle()` tercih et (hataları yutma)
- `await` olmayan Promise yazma (Vercel function exit'inde kaybolabilir)

## Roller
- **ADMIN**: Tam erişim
- **TELESALES_AGENT**: Kendi arama listeleri, kendi leadleri (varsayılan rol)
- **FIELD_AGENT**: Legacy enum, aktif akışta kullanılmaz

## Veritabanı Kuralları
- Her tablo RLS aktif (Mayıs 2026 sıkılaştırma: "herkes okur" kaldırıldı)
- `updated_at` trigger'ı zorunlu
- Çatışma önleme constraint'leri:
  - `assignments`: `UNIQUE(lead_id)` — bir lead asla iki kez atanmaz
  - `call_lists`: `UNIQUE(agent_id, list_date)` — bir ajana aynı gün ikinci liste yazılmaz
  - `agents`: `UNIQUE(user_id)` — Auth user'ı tek bir agent kaydına bağlanır
  - `leads`: `UNIQUE(google_place_id)` — duplicate detection için upsert
- Atomicity gereken yerlerde Postgres RPC kullan (`create_call_list_atomic`, `update_call_item_atomic`, `acquire_assignment_lock`, `reset_weekly_plan_atomic`, `reset_daily_plan_atomic`)

## Hata Yönetimi
- Endpoint hata response'ları `src/lib/errors.ts`'deki `toClientErrorMessage()` ile sanitize edilsin (stack/PII sızdırma)
- Postgres RPC hata kodları:
  - `23505` → unique violation (genelde 409 Conflict)
  - `P0001` → custom plpgsql exception (400)
  - `P0002` → bulunamadı (404)

## Operasyonel
- Cron endpoint'leri `CRON_SECRET` env var ile korunur
- Pahalı endpoint'ler (`/api/scraper`, `/api/calls`, `/api/leads/enrich-*`, `/api/auth`) middleware'de rate limit'lidir
- Yeni cron eklendiğinde `vercel.json` güncellenmeli
