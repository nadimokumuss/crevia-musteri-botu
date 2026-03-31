# Database Migration Skill

Supabase migration dosyaları oluştur ve uygula.

## Dosyalar
- `supabase/migrations/` - Migration dosyaları
- `supabase/seed.sql` - Seed verileri

## Kurallar
- Her tablo RLS aktif olmalı
- updated_at trigger zorunlu
- Uygun indeksler ekle
- Migration dosya adı: `YYYYMMDDHHMMSS_description.sql`
- `npx supabase db push` ile doğrula
