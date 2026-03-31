# Scraper Integration Skill

Yeni scraper adaptörü ekle veya mevcut olanı güncelle.

## Dosyalar
- `src/infra/scrapers/lead-source.interface.ts` - ILeadSource arayüzü
- `src/infra/scrapers/scraper-factory.ts` - Factory
- `src/infra/scrapers/*.adapter.ts` - Adaptörler

## Kurallar
- ILeadSource arayüzünü uygula
- Factory'ye kaydet
- Hata yönetimi AppError sınıfları ile
- Rate limiting uygula
- Mock HTTP ile entegrasyon testi yaz
