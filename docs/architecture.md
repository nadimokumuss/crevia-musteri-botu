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
- `assignment/collision-guard.ts`
- `scheduler/weekly-planner.ts`

### `src/infra`

I/O adapter'leri:

- Supabase client'lari
- scraper adapter'leri
- website/PageSpeed adapter'leri
- activity log yazimi

### `src/app`

- dashboard sayfalari
- App Router API route'lari
- auth ve middleware

### `src/lib`

- validator'ler
- logger
- sabitler
- tarih yardimcilari
- signal builder'lar

## Aktif Veri Akisi

### 1. Manuel tarama

1. Admin `/admin` ekraninda ilce, kaynak ve kategori secer.
2. `POST /api/scraper` scrape job kaydi olusturur.
3. Adapter harici kaynaktan isletmeleri toplar.
4. `leads` tablosuna upsert edilir.
5. Need score alanlari hesaplanir.

### 2. Manuel arama listesi

1. Admin ajan ve tarih secer.
2. `POST /api/calls`:
   - ajanin aktif ve `TELESALES_AGENT` oldugunu dogrular
   - `agent_preferences` kaydini okur
   - daha once assignment almamis lead'leri filtreler
   - ihtiyac skoruna gore liste olusturur
   - `call_lists` ve `assignments` tablolarina yazar
3. Ajan `/my/calls` ekraninda sonucu gunceller.
4. `assignments.status` ve `lead_activities` senkronize edilir.

## Yetki ve Erisim

Roller:

- `ADMIN`
- `TELESALES_AGENT`
- `FIELD_AGENT` (legacy)

Yetki kontrolleri:

- UI erisimi middleware ile
- API route erisimi middleware + route dogrulamasi ile
- veritabani tarafinda RLS aktif

## Veritabani Tablolari

### `leads`

Tarama ile gelen tum isletme kayitlari, skorlar ve operasyon durumu.

### `assignments`

Her lead icin tek assignment kaydi tutulur.

Kritik kural:

- `UNIQUE(lead_id)`

Sonuc:

- bir lead tekrar atanmaz
- yeni manuel liste yalnizca hic atanmamis lead'lerden uretilir

### `call_lists`

Ajan + tarih bazli JSON item listeleri.

### `agent_preferences`

Manuel call listesi uretiminde opsiyonel ilce/kategori filtresi.

### `scrape_jobs`

Tarama calisma kayitlari ve istatistikleri.

### `weekly_plans` ve `routes`

Legacy veri yapilari.

- `weekly_plans`: eski plan/sifirlama kayitlari
- `routes`: saha modulu kapali oldugu icin yeni kayit uretmez

## API Yuzeyi

### Aktif endpoint'ler

- `POST /api/scraper`
- `GET /api/scraper`
- `POST /api/calls`
- `GET /api/calls`
- `GET /api/my/calls`
- `PATCH /api/my/calls/[lead_id]`
- `POST /api/leads/score`
- `POST /api/leads/enrich-instagram`
- `GET /api/agents`
- `PUT /api/agents/preferences`

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

## Takvim

- Pazartesi: `REMOTE`
- Sali: `REMOTE`
- Carsamba: `REMOTE`
- Persembe: `REMOTE`
- Cuma: `REMOTE`
- Cumartesi: `OFF`
- Pazar: `OFF`

`weekly-planner` artik bu takvimi tek kaynak olarak kullanir.

## Test Kapsami

- scoring algoritmasi
- call list secimi
- clustering
- route optimizer
- assignment distributor
- schedule hesaplari
- scraper adapter entegrasyonu

Calistirma:

```bash
npm run typecheck
npm run lint
npm run test
```
