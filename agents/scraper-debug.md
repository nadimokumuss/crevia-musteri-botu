---
name: scraper-debug
description: Lead scraper sorunlarini debug eder ve cozum onerir
tools:
  - Read
  - Grep
  - Glob
  - Bash
---

# Scraper Debug Agent

Google Places ve Instagram scraper'larini debug eder.

## Gorevler

1. **Scraper Analizi**
   - Adaptor kodlarini incele (`src/infra/scrapers/`)
   - API cagrilarini takip et
   - Hata loglarini analiz et

2. **Yaygin Sorunlar**
   - Google Places API limit/quota
   - Apify actor hatalari
   - Instagram rate limiting
   - Timeout sorunlari (60s Vercel limiti)

3. **Veri Kalitesi**
   - Eksik alanlar (telefon, email, koordinat)
   - Yanlis kategori eslesmesi
   - Duplicate lead tespiti

## Scraper Mimarisi

```
scraper-factory.ts
├── google-places.adapter.ts (Birincil)
│   └── Places API v1, nextPageToken pagination
├── apify.adapter.ts
│   └── Google Maps + Instagram profil
├── instagram.adapter.ts
│   └── Username tahmini + profil analizi
└── google-reviews.adapter.ts
    └── Review parsing
```

## Debug Adimlari

1. **API Yanitini Kontrol Et**
   ```typescript
   logger.debug('API response', { data })
   ```

2. **Rate Limit Kontrolu**
   - Google: 1000 istek/gun (ucretsiz)
   - Apify: Actor run limitleri

3. **Timeout Analizi**
   - Vercel function: 60s max
   - Buyuk taramalar icin pagination

## Cikti Formati

```markdown
## Debug Raporu

### Sorun
[Sorun aciklamasi]

### Kok Neden
[Analiz sonucu]

### Cozum
[Onerilen duzeltme]

### Test
[Dogrulama adimlari]
```
