# Need Score Algoritmasi

## Genel Bakis

Her lead 0-100 arasi puanlanir. Yuksek puan = dijital varligi zayif = kreatif ajans hizmetine ihtiyaci yuksek.

**4-sutunlu puanlama sistemi:**

| Sutun | Aralik | Olcum |
|-------|--------|-------|
| Google Alt Puani | 0-30 | Google Business profil kalitesi |
| Instagram Alt Puani | 0-30 | Instagram hesap varligi ve kalitesi |
| Website Alt Puani | 0-30 | Website performansi ve mobil uyumu |
| Marketing Alt Puani | 0-20 | Reklam ve tracking altyapisi |

**Onemli**: Puanlama tarama sonrasi otomatik calisir. Yeni leadler aninda puanlanir. Ayrica toplu puanlama (`POST /api/leads/score`) ile puanlanmamis leadler toplu olarak puanlanabilir.

## Google Alt Puani (0-30)

| Sinyal | Kosul | Puan |
|--------|-------|------|
| Google verisi yok | google === null | +15 |
| Profil sahiplenilmemis | isClaimed === false | +12 |
| Dusuk puan veya az yorum | rating < 3.5 VEYA reviewCount < 10 | +8 |
| Iletisim eksik | website veya telefon yok | +8 |
| Dusuk yanit orani | responseRate < %20 | +5 |
| Mukemmel isletme (ceza) | rating > 4.5 VE reviewCount > 100 | **-5** |

**Not**: Google verisi tamamen yoksa 15 puan verilir ve diger sinyaller degerledirilmez.

## Instagram Alt Puani (0-30)

| Sinyal | Kosul | Puan |
|--------|-------|------|
| Instagram hesabi yok | instagram === null | +15 |
| Inaktif | lastPostDate > 30 gun | +8 |
| Gonderi duzensizligi | postingRegularity === 'gaps' | +5 |
| Dusuk profil kalitesi | highlight yok VEYA bio link yok | +5 |
| Dusuk etkilesim | engagementRate < %1 | +3 |
| Ajans tespit (ceza) | bioContainsAgency === true | **-15** |

**Not**: Instagram hesabi yoksa 15 puan verilir ve diger sinyaller degerlendirilmez.

## Website Alt Puani (0-30)

| Sinyal | Kosul | Puan |
|--------|-------|------|
| Website yok | website === null | +15 |
| Yavas site | speedScore < 50 | +8 |
| Mobil uyumsuz | isMobileFriendly === false | +5 |
| Kirik sayfalar | has404s === true | +5 |
| Cok yavas site | speedScore < 30 | +3 |

**Not**: Website yoksa 15 puan verilir ve diger sinyaller degerlendirilmez.

## Marketing Alt Puani (0-20)

| Sinyal | Kosul | Puan |
|--------|-------|------|
| Website yok | !hasWebsite | +10 (tek sinyal) |
| Marketing verisi yok | marketing === null | +10 (tek sinyal) |
| Meta Pixel yok | hasMetaPixel === false/null | +5 |
| GA4 yok | hasGA4 === false/null | +5 |
| Meta reklam yok | hasActiveMetaAds === false/null | +5 |
| Google reklam yok | hasActiveGoogleAds === false/null | +5 |

**Not**: Website yoksa veya marketing verisi yoksa 10 puan verilir ve diger sinyaller degerlendirilmez.

## Oneri Esleme

Esik degerleri (`src/lib/constants.ts`):

| Puan Araligi | Oneri | Aksiyon |
|-------------|-------|---------|
| 65-100 | HIGH_PRIORITY | Saha ziyareti (Pazartesi/Carsamba) |
| 40-64 | MEDIUM | Telefon aramasi (Sali/Persembe) |
| 15-39 | LOW_PRIORITY | Otonom temas |
| 0-14 | SKIP | Pas gec |

## Instagram Zenginlestirme

`POST /api/leads/enrich-instagram` endpoint'i ile calisan mekanizma:

1. ig_username'i olmayan leadler secilir (maks 50)
2. Her lead icin Instagram kullanici adi tahmin edilir:
   - Oncelik 1: Website URL'sinden domain adi (orn: `kafeistanbul.com` → `kafeistanbul`)
   - Oncelik 2: Isletme adindan (Turkce karakter donusumu ile, orn: `Guzellik Salonu Ece` → `guzelliksalonuece`)
3. Apify Instagram profil scraper ile profil verisi cekilir
4. Basarili eslesmeler leads tablosunda guncellenir
5. Puan yeniden hesaplanir (Instagram verileri artik mevcut)

Bir lead'in Instagram hesabi bulunursa, instagram_sub_score 15'ten (hesap yok bonusu) dusebilir — bu IG'si iyi olan isletmelerin puanini dusurur (ajans hizmetine ihtiyaclari daha az).

## Website Zenginlestirme

`POST /api/leads/enrich-website` endpoint'i ile calisan mekanizma:

1. Website'i olan ama website_speed_score'u olmayan leadler secilir
2. PageSpeed Insights API ile analiz yapilir
3. Hiz skoru, mobil uyumluluk, 404 durumu, Meta Pixel ve GA4 varligi kontrol edilir
4. Sonuclar leads tablosunda guncellenir
5. Puan yeniden hesaplanir (Website + Marketing verileri artik mevcut)

## Uygulama

- Algoritma: `src/core/scoring/need-score.ts`
- Sinyal tipleri: `src/types/scoring.ts`
- Esik degerleri: `src/lib/constants.ts` (SCORE_THRESHOLDS)
- Toplu puanlama API: `src/app/api/leads/score/route.ts`
- Otomatik puanlama: `src/app/api/scraper/route.ts` (autoScoreLeads)
