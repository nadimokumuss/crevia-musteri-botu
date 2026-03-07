# Crevia Sales OS - Agent Talimatları

## Genel Kurallar
- Türkçe UI metinleri kullan
- `console.log` yerine yapılandırılmış logger kullan
- Saf fonksiyonları `src/core/` altında, I/O yapan kodları `src/infra/` altında tut
- Tüm dış veri Zod ile doğrulansın
- RLS politikalarını atlatma, doğrudan SQL çalıştırma

## Roller
- **ADMIN**: Tam erişim
- **FIELD_AGENT**: Kendi atamaları, rotaları, leadleri
- **TELESALES_AGENT**: Kendi arama listeleri, leadleri

## Veritabanı Kuralları
- Her tablo RLS aktif
- `updated_at` trigger'ı zorunlu
- Çatışma önleme: `UNIQUE(lead_id, scheduled_date, assignment_type)` kısıtlaması
