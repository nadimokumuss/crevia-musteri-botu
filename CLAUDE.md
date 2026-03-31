# Repo Notlari

## Guncel Operasyon Modeli

- Sistem su an yalnizca telefon ajani akisinda calisir.
- Tarama manuel olarak `POST /api/scraper` ile baslatilir.
- Arama listeleri manuel olarak `POST /api/calls` ile uretilir.
- Otomatik dagitim kapalidir.
- Hafta ici tum gunler `REMOTE`, hafta sonu `OFF`.
- Saha modulu ve rota ekranlari pasiftir.

## Roller

- `ADMIN`
- `TELESALES_AGENT`
- `FIELD_AGENT` (legacy, aktif degil)

Varsayilan yeni ajan rolu `TELESALES_AGENT`.

## Veritabani Kurallari

- Tum tablolar RLS ile korunur.
- `updated_at` trigger'lari korunur.
- Assignment gercegi: `UNIQUE(lead_id)`
- Bir lead tekrar atanmaz.

## Kritik Endpoint'ler

### Aktif

- `POST /api/scraper`
- `GET /api/scraper`
- `POST /api/calls`
- `GET /api/calls`
- `GET /api/my/calls`
- `PATCH /api/my/calls/[lead_id]`
- `POST /api/leads/score`
- `POST /api/leads/enrich-instagram`

### Pasif

Bu endpoint'ler `410` doner:

- `POST /api/weekly-plan`
- `POST /api/weekly-plan/distribute`
- `POST /api/daily-plan/distribute`
- `POST /api/assignments/distribute`
- `/api/routes/*`
- `/api/my/route/*`

## UI Yuzeyi

- `/admin`: manuel tarama + manuel arama listesi olusturma
- `/calls`: yonetici arama listeleri gorunumu
- `/my/calls`: ajan isleme ekrani
- `/routes` ve `/my/route`: pasif bilgilendirme ekranlari

## Tercihler

- `agent_preferences` bos olabilir.
- Bos tercih = manuel liste uretiminde tum lead havuzu.
- Dolu tercih = ilce/kategori filtresi.

## Kalite Kontrolleri

```bash
npm run typecheck
npm run lint
npm run test
```
