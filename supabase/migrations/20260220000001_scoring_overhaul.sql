-- Puanlama sistemi yeniden tasarimi
-- 4-sutunlu puanlama: Google(0-30) + Instagram(0-30) + Website(0-30) + Marketing(0-20)

-- Website analiz verileri
ALTER TABLE leads ADD COLUMN IF NOT EXISTS website_speed_score DOUBLE PRECISION;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS website_is_mobile_friendly BOOLEAN;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS website_has_404s BOOLEAN;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS website_has_meta_pixel BOOLEAN;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS website_has_ga4 BOOLEAN;

-- Reklam verileri
ALTER TABLE leads ADD COLUMN IF NOT EXISTS has_active_meta_ads BOOLEAN;

-- Google yorum yanit orani
ALTER TABLE leads ADD COLUMN IF NOT EXISTS google_response_rate DOUBLE PRECISION;

-- Instagram gelismis metrikler
ALTER TABLE leads ADD COLUMN IF NOT EXISTS ig_posting_regularity TEXT CHECK (ig_posting_regularity IN ('regular', 'irregular', 'gaps', 'dead'));
ALTER TABLE leads ADD COLUMN IF NOT EXISTS ig_engagement_rate DOUBLE PRECISION;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS ig_reels_ratio DOUBLE PRECISION;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS ig_has_bio_link BOOLEAN;

-- Email kaynak bilgisi
ALTER TABLE leads ADD COLUMN IF NOT EXISTS email_source TEXT CHECK (email_source IN ('website', 'google', 'instagram', 'manual'));

-- Yeni puanlama alt-skorlari
ALTER TABLE leads ADD COLUMN IF NOT EXISTS website_sub_score INTEGER DEFAULT 0;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS marketing_sub_score INTEGER DEFAULT 0;

-- CHECK constraint'leri yeni sub-score kolonlarina ekle
ALTER TABLE leads ADD CONSTRAINT chk_website_sub_score CHECK (website_sub_score >= 0 AND website_sub_score <= 30);
ALTER TABLE leads ADD CONSTRAINT chk_marketing_sub_score CHECK (marketing_sub_score >= 0 AND marketing_sub_score <= 20);

-- Mevcut constraint'leri guncelle: google_sub_score 0-50 -> 0-30, instagram_sub_score 0-50 -> 0-30
-- Once mevcut veriyi 30 ile sinirla
UPDATE leads SET google_sub_score = 30 WHERE google_sub_score > 30;
UPDATE leads SET instagram_sub_score = 30 WHERE instagram_sub_score > 30;

-- Eski constraint'leri kaldir ve yenilerini ekle
ALTER TABLE leads DROP CONSTRAINT IF EXISTS leads_google_sub_score_check;
ALTER TABLE leads ADD CONSTRAINT leads_google_sub_score_check CHECK (google_sub_score >= 0 AND google_sub_score <= 30);

ALTER TABLE leads DROP CONSTRAINT IF EXISTS leads_instagram_sub_score_check;
ALTER TABLE leads ADD CONSTRAINT leads_instagram_sub_score_check CHECK (instagram_sub_score >= 0 AND instagram_sub_score <= 30);
