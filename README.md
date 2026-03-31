# Crevia Sales OS

Crevia Sales OS, Istanbul'daki isletmeleri tarayip dijital ihtiyac puani ureten ve bu lead'leri telefon ajani ekiplerine yoneten bir satis operasyon uygulamasidir.

## Guncel Isletim Modeli

- Sistem su an **yalnizca TELESALES_AGENT** akisinda calisir.
- **Tarama manuel** baslatilir: admin `/admin` ekranindan veya `POST /api/scraper` ile is tetikler.
- **Dagitim manuel** yapilir: admin belirli ajan ve tarih icin `POST /api/calls` ile arama listesi uretir.
- **Otomatik dagitim kapali**dir. Legacy endpoint'ler (`/api/weekly-plan`, `/api/weekly-plan/distribute`, `/api/daily-plan/distribute`, `/api/assignments/distribute`) `410` doner.
- **Tekrar atama kapali**dir. Bir lead herhangi bir assignment aldiginda yeniden listeye giremez. Veritabani gercegi: `UNIQUE(lead_id)`.
- **Hafta ici her gun REMOTE**, hafta sonu `OFF`.

## Temel Akis

### 1. Manuel tarama

1. Admin ilce, kategori, kaynak ve limit secer.
2. `POST /api/scraper` scrape job kaydi olusturur.
3. Kayitlar `leads` tablosuna upsert edilir.
4. Tarama sonrasi need score alanlari guncellenir.

### 2. Manuel arama listesi

1. Admin telefon ajanini ve tarihi secer.
2. `POST /api/calls`:
   - aktif telefon ajanini dogrular
   - ajanin ilce/kategori tercihlerini okur
   - telefonu olan ve daha once hic assignment almamis lead'leri secer
   - `need_score` azalan sirada liste uretir
   - `call_lists` ve `assignments` kayitlarini birlikte yazar
3. Ajan `/my/calls` ekranindan sonucu isler.
4. Sonuc assignment ve lead activity kayitlariyla senkron tutulur.

## Roller

- `ADMIN`: genel yonetim, tarama, manuel liste olusturma, analitik, ajan yonetimi
- `TELESALES_AGENT`: kendi arama listeleri ve kendi lead gorunumleri
- `FIELD_AGENT`: enum olarak korunur fakat aktif akista kullanilmaz

## Mimari

### Uygulama

- `Next.js 16` App Router
- `Supabase` veritabani + auth
- `Zod` ile input dogrulama
- `Vitest` ile unit/integration testleri

### Klasorler

- `src/core`: saf is kurallari
- `src/infra`: Supabase ve harici adapter'ler
- `src/app`: App Router sayfalari ve API route'lari
- `src/lib`: validator, logger, sabitler, tarih yardimcilari
- `tests`: unit ve integration testleri

### One Cikan Moduller

- `src/core/scoring/need-score.ts`: 4 sutunlu ihtiyac puani algoritmasi
- `src/core/routing/call-list-generator.ts`: tercihli lead secimi ve arama listesi uretimi
- `src/core/assignment/collision-guard.ts`: `lead_id` bazli assignment kilidi
- `src/app/api/calls/route.ts`: manuel arama listesi olusturma
- `src/app/api/my/calls/[lead_id]/route.ts`: ajan sonuc girisi ve assignment senkronizasyonu

## Veri Modeli

Ana tablolar:

- `districts`
- `agents`
- `agent_preferences`
- `leads`
- `scrape_jobs`
- `call_lists`
- `assignments`
- `lead_activities`
- `weekly_plans` (legacy plan/sifirlama kayitlari)
- `routes` (legacy, pasif)

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

- `POST /api/scraper` — manuel tarama
- `GET /api/scraper` — son scrape job'lari
- `POST /api/calls` — manuel arama listesi olustur
- `GET /api/calls` — arama listelerini getir
- `GET /api/my/calls` — ajanin kendi listesi
- `PATCH /api/my/calls/[lead_id]` — arama sonucu guncelle
- `POST /api/leads/score` — toplu puanlama
- `POST /api/leads/enrich-instagram` — IG kesif kuyrugunu tek seferde isle

## Pasif Legacy Yuzeyler

- `/routes`
- `/my/route`
- `POST /api/weekly-plan`
- `POST /api/weekly-plan/distribute`
- `POST /api/daily-plan/distribute`
- `POST /api/assignments/distribute`
- `/api/routes/*`
- `/api/my/route/*`

Bu yuzeyler korunur ancak yeni veri uretmez.

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

## Operasyon Notlari

- Varsayilan ajan rolu `TELESALES_AGENT` olarak ayarlanmistir.
- Telefonu olmayan lead'ler arama listesine girmez.
- Mevcut bir ajan/tarih listesi uzerine sessiz overwrite yapilmaz.
- Instagram kesif kuyrugu admin ekranindan tek tikla calistirilabilir; kalan detay backfill'i Vercel cron her 30 dakikada bir tamamlar.
- Saha modulu ileride geri acilabilir; kodu repoda tutulur ama aktif akista kullanilmaz.
