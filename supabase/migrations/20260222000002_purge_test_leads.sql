-- Test verilerini temizle: sıfırdan tarama + dağıtım yapılacak
-- Cascade: assignments + lead_activities otomatik silinir (ON DELETE CASCADE)
-- JSONB alanlar manuel temizlenmeli

BEGIN;

-- 1. routes → stops JSONB'yi boşalt
UPDATE routes SET stops = '[]'::jsonb;

-- 2. call_lists → items JSONB'yi boşalt
UPDATE call_lists SET items = '[]'::jsonb;

-- 3. scrape_jobs tablosunu temizle
DELETE FROM scrape_jobs;

-- 4. weekly_plans tablosunu temizle
DELETE FROM weekly_plans;

-- 5. Tüm lead'leri sil (assignments + lead_activities CASCADE ile silinir)
DELETE FROM leads;

COMMIT;
