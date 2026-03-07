# Crevia Sales OS

Istanbul merkezli kreatif ajans **Crevia** icin gelistirilen B2B satis otomasyon platformu. Potansiyel musterileri otomatik kesfedin, puanlayin, rota olusturun ve satis surecini yonetin.

## Ozellikler

### Haftalik Plan Sistemi
- Admin tek tikla haftalik plan olusturur
- Ajan tercihlerine (ilce + kategori) gore otomatik tarama
- **Client-driven scraping**: Tarama islemleri frontend'den orkestre edilir, her job kendi Vercel function instance'inda calisir
- Tarama sonrasi leadler otomatik puanlanir
- Puanlanan leadler ajanlara otomatik dagitilir (saha + telefon)
- Gercek zamanli progress bar (polling yok, client-side takip)
- Stuck plan otomatik temizleme (10 dk timeout) + manuel sifirlama butonu
- Ayni isletmenin farkli tarihlere tekrar atanmasi onlenir

### Musteriler (Leads)
- Puanlama bazli musteri listesi (filtreleme, siralama, sayfalama)
- Detay sayfasinda 6 sekme: Bilgiler, Google, Instagram, Website, Marketing, Aktivite
- Durum yonetimi: NEW → CONTACTED → QUALIFIED → PROPOSAL → WON/LOST/SKIP
- Kronolojik aktivite logu (durum degisikligi, atama, arama, ziyaret, puanlama, not)

### Rota Planlayici
- Ajan secimi (rol bazli filtreleme) + tarih secimi ile otomatik rota olusturma
- En yuksek puanli leadlerden optimize rota (Nearest Neighbor + 2-opt TSP)
- DBSCAN cografi kumeleme
- Google Maps navigasyon entegrasyonu
- Harita gorunumu (React-Leaflet)
- Ziyaret sonucu takibi (COMPLETED/NO_SHOW/CANCELLED)

### Arama Listeleri
- FIELD ajanlar Pazartesi/Carsamba, TELESALES ajanlar Pazartesi-Cuma gunde 20 arama
- Arama sonucu takibi (COMPLETED/NO_ANSWER/CALLBACK/INTERESTED/NOT_INTERESTED/WRONG_NUMBER)
- Sonuclar geri alinabilir (PENDING'e donus)
- PDF ve Excel export (admin + ajan sayfasi)

### Analitik Dashboard
- KPI kartlari: toplam lead, donusum orani, ortalama puan, aktif ajan sayisi
- Durum hunisi (funnel) grafigi
- Oneri dagilimi (pie chart)
- Haftalik trend grafigi (son 12 hafta)
- Kategori kirilimi
- Arama sonuc dagilimi
- Ajan performans tablosu

### Ajan Yonetimi
- Ajan CRUD (ADMIN, FIELD_AGENT, TELESALES_AGENT rolleri)
- Ajan aktif/pasif toggle (tek tikla deaktivasyon)
- Ajan tercihleri: ilce ve kategori secimi (bos tercih = tum lead'lere acik)
- Ajan bazinda performans takibi

### Tarama (Scraping)
- Google Places API ve Apify ile ilce/kategori bazli isletme taramasi
- Instagram profil analizi ve zenginlestirme
- Website analizi (PageSpeed Insights)
- Otomatik Need Score puanlama (tarama sonrasi aninda)
- E-posta, telefon, website bilgisi toplama

## Teknoloji

| Katman | Teknoloji |
|--------|-----------|
| Framework | Next.js 16 (App Router, React 19) |
| Veritabani | Supabase (PostgreSQL + Auth + RLS + Realtime) |
| UI | shadcn/ui + Tailwind CSS + Recharts |
| Harita | React-Leaflet + OpenStreetMap |
| Scraping | Google Places API v1, Apify (Google Maps + Instagram) |
| Website Analiz | PageSpeed Insights API |
| State | Server Components + Zustand + TanStack Query |
| Deploy | Vercel |
| Dil | TypeScript (strict) |

## Baslarken

```bash
# Bagimliliklar
npm install

# Environment variables (.env.local)
# Gerekli: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
# Gerekli: GOOGLE_PLACES_API_KEY
# Opsiyonel: APIFY_API_TOKEN, NEXT_PUBLIC_APP_URL

# Gelistirme
npm run dev

# Tip kontrolu
npm run typecheck

# Build
npm run build

# Test
npm run test

# Lint
npm run lint
```

## Proje Yapisi

```
src/
├── app/                  Next.js App Router
│   ├── (dashboard)/      Dashboard sayfalari
│   │   ├── admin/          Yonetici paneli (haftalik plan)
│   │   ├── leads/          Musteri listesi + detay (aktivite sekmesi dahil)
│   │   ├── routes/         Rota planlayici
│   │   ├── calls/          Arama listeleri (admin gorunumu)
│   │   ├── agents/         Ajan yonetimi
│   │   ├── analytics/      Analitik dashboard (KPI, grafikler, trend)
│   │   ├── settings/       Ayarlar
│   │   ├── my/calls/       Ajanin arama listesi
│   │   ├── my/leads/       Ajanin leadleri
│   │   └── my/route/       Ajanin gunluk rotasi
│   └── api/              API routes
│       ├── leads/          CRUD + puanlama + Instagram/Website zenginlestirme + aktivite
│       ├── scraper/        Tarama islemleri
│       ├── routes/         Rota CRUD + optimizasyon
│       ├── assignments/    Atama CRUD + dagitim
│       ├── agents/         Ajan CRUD + tercihler
│       ├── districts/      Ilce CRUD
│       ├── calls/          Arama listesi islemleri
│       ├── analytics/      Analitik veri
│       ├── weekly-plan/    Haftalik plan CRUD + durum + dagitim
│       ├── my/             Ajan kisisel endpointleri (calls, leads, route)
│       └── auth/           Supabase Auth
├── core/                 Saf is mantigi (I/O YOK)
│   ├── scoring/            Need Score algoritmasi (4-sutunlu)
│   ├── routing/            DBSCAN kumeleme + TSP optimizasyon + arama listesi
│   ├── assignment/         Atama dagitimi + catisma onleme
│   └── scheduler/          Haftalik planlayici + dagitici
├── infra/                Dis adaptorler (I/O siniri)
│   ├── supabase/           DB client (server + browser + aktivite loglama)
│   ├── scrapers/           Google Places, Apify, Instagram adaptarleri
│   ├── maps/               Google Distance Matrix
│   ├── website/            PageSpeed Insights adaptor
│   └── auth/               Supabase Auth
├── lib/                  Paylasilan yardimcilar (logger, errors, constants, validators, utils)
├── hooks/                React hook'lari (useCurrentUser, useRealtime)
├── components/           React UI bilesenleri
│   ├── ui/                 shadcn/ui temel bilesenler
│   ├── analytics/          Analitik grafik bilesenleri (7 adet)
│   ├── leads/              Lead bilesenleri (aktivite timeline, kategori kartlari)
│   ├── maps/               Harita bilesenleri
│   ├── routes/             Rota bilesenleri (export butonlari)
│   ├── calls/              Arama listesi bilesenleri (export butonlari)
│   ├── layout/             Layout (sidebar, topbar, mobile-nav)
│   └── shared/             Ortak bilesenler (not dialog, tercih uyari banner)
└── types/                TypeScript tip tanimlari (9 dosya)
```

## Veritabani

10 tablo (tumunde RLS aktif):

| Tablo | Aciklama |
|-------|----------|
| districts | Istanbul ilceleri (ad, konum, polygon) |
| leads | Potansiyel musteriler (isletme bilgileri, Google/Instagram/Website verileri, 4-sutunlu puanlama) |
| agents | Satis ajanlari (rol, baz konum, gunluk ziyaret limiti) |
| assignments | Atamalar (ziyaret/arama, tarih, durum, catisma onleme kilidi) |
| routes | Gunluk saha rotalari (duraklar, mesafe, sure) |
| scrape_jobs | Tarama is kayitlari (durum, bulunan/yeni/guncellenen lead sayisi) |
| call_lists | Telefon arama listeleri (items JSONB, tamamlanma takibi) |
| lead_activities | Lead aktivite logu (durum degisikligi, atama, arama, ziyaret, puanlama, not) |
| agent_preferences | Ajan tercihleri (ilce + kategori dizileri) |
| weekly_plans | Haftalik plan kayitlari (durum, tarama isleri, dagitim istatistikleri) |

## Haftalik Program (Role-Based)

### FIELD_AGENT (haftalik 60 isletme)
| Gun | Tip | Hedef |
|-----|-----|-------|
| Pazartesi | REMOTE (arama) | 20 isletme |
| Sali | FIELD (saha) | 10 isletme |
| Carsamba | REMOTE (arama) | 20 isletme |
| Persembe | FIELD (saha) | 10 isletme |
| Cuma | ADMIN | - |
| Cumartesi/Pazar | OFF | - |

### TELESALES_AGENT (haftalik 100 isletme)
| Gun | Tip | Hedef |
|-----|-----|-------|
| Pazartesi-Cuma | REMOTE (arama) | 20 isletme/gun |
| Cumartesi/Pazar | OFF | - |

## Puanlama Sistemi

4-sutunlu Need Score (0-100):

| Sutun | Aralik | Olcum |
|-------|--------|-------|
| Google | 0-30 | Profil sahiplenme, puan, yorum, iletisim, yanit orani |
| Instagram | 0-30 | Hesap varligi, aktivite, profil kalitesi, etkilesim, ajans tespiti |
| Website | 0-30 | Site varligi, hiz, mobil uyum, kirik sayfalar |
| Marketing | 0-20 | Meta Pixel, GA4, Meta reklam, Google reklam |

Yuksek puan = dijital varligi zayif = ajans hizmetine ihtiyaci yuksek.

### Oneri Esleme

| Puan | Oneri | Aksiyon |
|------|-------|---------|
| 65-100 | HIGH_PRIORITY | Saha ziyareti |
| 40-64 | MEDIUM | Telefon aramasi |
| 15-39 | LOW_PRIORITY | Otonom temas |
| 0-14 | SKIP | Pas gec |

## Degisiklik Gecmisi

### v0.13.2 (2026-02-28)
- **Gelecek tarih kisitlamasi kaldirildi**: Ajanlar artik tum tarihlerdeki arama listelerini goruntuleyebilir ve sonuc girebilir. Manuel atama ile esnek calisma destegi

### v0.13.1 (2026-02-28)
- **Assignments FK ambiguity fix**: `agents(full_name)` → `agents!agent_id(full_name)` ile PostgREST 300 hatasi giderildi
- **NotesDialog stale state fix**: Dialog farkli lead icin acildiginda eski notu gostermesi duzeltildi
- **2-opt rota optimizer sinir duzeltmesi**: Acik yol modu ile dairesel tur varsayimi arasindaki tutarsizlik giderildi
- **Google Distance ulasilamaz konum**: Element status !== OK durumunda 0 yerine Infinity donuyor
- **Layout metadata**: "Create Next App" → "Crevia Sales OS", lang="tr"
- **Collision-guard hata kontrolu**: Suresi dolmus kilit temizleme basarisizligina warn logu eklendi
- **DEMO status eksikligi**: /my/calls sayfasinda "Deneme Cekimi" secenegi eksikti, admin /calls badge'lerine tum statusler eklendi
- **Optimistik update rollback**: my/calls, telesales-leads, routes sayfalarinda fetch basarisiz olursa UI onceki state'e geri aliniyor
- **Enrich-instagram error handling**: IG veri ve puan update'lerinde hata kontrolu eklendi
- **Mobil responsive ajan sayfalari**: my/calls, my/leads, my/route tablolarinda mobilde gereksiz sutunlar gizlendi, durum dropdown her zaman gorunur
- **Saha ajani interaktif durum degistirme**: field-agent-leads-view'da statik Badge yerine Select dropdown eklendi, ajanlar artik mobil/masaustunden durum guncelleyebiliyor
- **My leads API assignment_id**: `/api/my/leads` artik assignment_id donduruyor, frontend durum update'i yapabiliyor

### v0.13.0 (2026-02-25)
- **Dinamik tarama limiti**: Ajan ihtiyacina gore scrape job basina limit hesaplanir (min 60, toplam ihtiyacin 1.5x'i)
- **Google Places pagination**: Her scrape job birden fazla sayfa cekerek 60+ lead toplayabilir (onceden max 20'de kaliyordu)
- **Scraper limit parametresi**: Scraper API'ye limit parametresi eklendi, weekly plan ihtiyaca gore limit gecirir

### v0.12.0 (2026-02-25)
- **Role-based haftalik takvim**: FIELD ajanlar Sal/Per saha + Pzt/Car arama; TELESALES ajanlar Pzt-Cum 5 gun arama
- **Gunluk 20 arama hedefi**: Tum ajanlar arama gunlerinde 20 isletme atanir (DAILY_CALL_TARGET sabiti)
- **Sonuc geri alma**: Arama ve ziyaret sonuclari PENDING'e geri alinabilir, completed_at temizlenir
- **Ajan aktif/pasif toggle**: Tek tikla ajan deaktivasyon/aktivasyon
- **Bos tercih kaydi**: Ajan tercihleri tamamen temizlenebilir (tum lead'lere acik)
- **Kategori exact match**: Substring esleme yerine birebir karsilastirma
- **Pass 2 iyilestirme**: Tercihi olan ajanlara tercih disi lead atanmaz

### v0.11.0 (2026-02-23)
- **Arama listesi export**: Admin (/calls) ve ajan (/my/calls) sayfalarinda PDF ve Excel indirme butonlari eklendi
- **Iki gecisli dagitim**: Tercih eslesen lead'ler dagitildiktan sonra kalan bos slotlar tercih gozetmeksizin doldurulur, her ajan gunluk limitine kadar atama alir

### v0.10.0 (2026-02-22)
- **Tercih uyari banner'i**: Ajan sayfalarina (/my/leads, /my/calls, /my/route) tercih ayarlanmadiysa uyari banner'i eklendi
- **Otomatik agent_preferences**: Yeni ajan olusturuldiginda bos tercih kaydi otomatik olusturuluyor
- **Tercihsiz ajan dagitimi**: Tercih ayarlamayan ajanlar dagitimdan dislanmak yerine tum lead'lere acik sayiliyor
- **Test verisi temizleme**: Tum test lead'lerini ve iliskili verileri temizleyen migration eklendi
- **Adil dagitim (round-robin)**: Lead'ler ajanlar arasinda sirayla dagitiliyor, ilk ajanin tum lead'leri kapmasi onlendi
- **Plan sifirlama iyilestirmesi**: Tamamlanmis planlar da silinebilir, sifirlama assignments/routes/call_lists verilerini de temizler
- **Dagitim tarih duzeltmesi**: getNextWeekPlan yerine getWorkDays kullanilarak dogru hafta gunleri hesaplaniyor
- **Assignments yazimi**: Dagitim sonrasi assignments tablosuna da kayit yaziliyor, my/leads sayfasi calisiyor
- **Genis tarama**: Her ilce icin kategori-spesifik + genel tarama yapilarak lead havuzu genisletiliyor

### v0.9.0 (2026-02-21)
- **Client-driven scraping**: Haftalik plan tarama orkestasyonu frontend'e tasindi. Server-to-server fetch Vercel Hobby'de timeout yapiyordu, artik her scrape job bagimsiz Vercel function instance'inda calisiyor
- **Dagitim endpoint**: Yeni `POST /api/weekly-plan/distribute` endpoint'i ile dagitim ayri tetikleniyor
- **Plan sifirlama**: Stuck/failed planlar icin `DELETE /api/weekly-plan` endpoint'i ve UI'da "Sifirla" butonu
- **Gercek zamanli progress**: Polling yerine client-side sayacla anlık ilerleme takibi
- **Stuck plan otomatik temizleme**: SCRAPING statusunde 10 dk'dan eski planlar otomatik siliniyor
- **Sentry kaldirildi**: Deploy sorunlarina yol actigi icin gecici olarak devre disi

### v0.8.0 (2026-02-21)
- **Lead aktivite logu**: Kronolojik audit trail — durum degisikligi, atama, arama, ziyaret, puanlama, not olaylari `lead_activities` tablosunda kayit altina aliniyor
- **Aktivite timeline UI**: Lead detay sayfasinda yeni "Aktivite" sekmesi, renk kodlu timeline bileseni
- **Analitik FK fix**: assignments→agents join belirsizligi giderildi

### v0.7.0 (2026-02-21)
- **Analitik dashboard**: KPI kartlari, durum hunisi, oneri dagilimi, haftalik trend (12 hafta), kategori kirilimi, arama sonuclari, ajan performans tablosu
- **Kategori MultiSelect**: Serbest metin yerine sabit listeden coklu secim
- **Rota ajan filtresi**: Telefon ajanlarini filtrele, ajan secim dropdown'u

### v0.6.0 (2026-02-21)
- **Hunter kaldirildi**: Tarama artik haftalik plan sistemi uzerinden calisir
- **Rota UX iyilestirmeleri**: Tiklanabilir isletme, optimistik guncelleme, geri butonu

### v0.5.0 (2026-02-20)
- **Haftalik plan sistemi**: Tek tikla otomatik tarama + dagitim, ajan tercihleri
- **4-sutunlu puanlama**: Google(0-30) + Instagram(0-30) + Website(0-30) + Marketing(0-20)
- **Website analizi**: PageSpeed Insights entegrasyonu
- **Tekrar dagitim onleme**: Ayni isletmenin farkli tarihlere atanmasi engellendi

### v0.4.0 (2026-02-19)
- **Hunter otomatik puanlama**: Tarama sonrasi leadler aninda puanlaniyor
- **E-posta toplama**: leads tablosuna email kolonu, Apify scraper email topluyor
- **Instagram zenginlestirme**: Website/isletme adindan IG kullanici adi tahmini + Apify profil analizi
- **Rota olusturma UI**: Ajan + tarih + maks durak secimi ile otomatik rota olusturma

### v0.3.0
- Hunter dinamik ilce yukleme, otomatik polling, leads API null param duzeltmesi

### v0.2.0
- Instagram search, Google Distance Matrix, Sentry yapilandirmasi

### v0.1.0
- Google Places (New) API, geo clustering, API duzeltmeleri

### v0.0.1
- Ilk commit: Proje iskeleti, 7 tablo, temel CRUD, scoring, routing
