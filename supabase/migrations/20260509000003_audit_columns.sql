-- Faz 1.1: leads tablosuna audit + GBP review cache kolonlari
-- ============================================================
-- Audit pipeline (Sonnet LLM synthesis) icin gereken yapilari hazirlar.
-- Faz 1 PR1'de yalniz sema kurulur; sutunlar PR2'de LLM tarafindan doldurulur.
--
-- Yeni kolonlar:
--   audit_narrative          — LLM-uretilmis 2-3 paragraf audit metni
--   audit_strengths/gaps     — JSONB array, structured audit findings
--   audit_tier               — A/B/C harcama potansiyeli skoru
--   phone_script             — 30 saniyelik telefon acilis scripti
--   outreach_email_*         — kisisellestirilmis e-posta konu + govde
--   audit_share_slug         — public audit URL slug (nanoid 12-char), UNIQUE
--   audit_generated_at       — son uretilme zamani
--   audit_model              — kullanilan LLM (or. claude-sonnet-4-6)
--   gbp_reviews_fetched_at   — Outscraper cache TTL check (30 gun, GBP ToS uyumlu)
--   gbp_reviews_summary      — Outscraper'dan zenginlestirilmis review ozet JSONB

ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS audit_narrative TEXT,
  ADD COLUMN IF NOT EXISTS audit_strengths JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS audit_gaps JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS audit_tier CHAR(1),
  ADD COLUMN IF NOT EXISTS phone_script TEXT,
  ADD COLUMN IF NOT EXISTS outreach_email_subject TEXT,
  ADD COLUMN IF NOT EXISTS outreach_email_body TEXT,
  ADD COLUMN IF NOT EXISTS audit_share_slug TEXT,
  ADD COLUMN IF NOT EXISTS audit_generated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS audit_model TEXT,
  ADD COLUMN IF NOT EXISTS gbp_reviews_fetched_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS gbp_reviews_summary JSONB;

-- Tier check (A/B/C only)
ALTER TABLE leads DROP CONSTRAINT IF EXISTS leads_audit_tier_check;
ALTER TABLE leads
  ADD CONSTRAINT leads_audit_tier_check
  CHECK (audit_tier IS NULL OR audit_tier IN ('A', 'B', 'C'));

-- Share slug UNIQUE
ALTER TABLE leads DROP CONSTRAINT IF EXISTS leads_audit_share_slug_unique;
ALTER TABLE leads
  ADD CONSTRAINT leads_audit_share_slug_unique UNIQUE (audit_share_slug);

-- Indexes (partial — yalnizca dolu satirlar icin)
CREATE INDEX IF NOT EXISTS idx_leads_audit_tier
  ON leads(audit_tier)
  WHERE audit_tier IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_leads_audit_generated_at
  ON leads(audit_generated_at DESC)
  WHERE audit_generated_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_leads_gbp_reviews_fetched_at
  ON leads(gbp_reviews_fetched_at)
  WHERE gbp_reviews_fetched_at IS NOT NULL;

COMMENT ON COLUMN leads.audit_narrative IS
  'LLM-uretilmis 2-3 paragraf audit metni (Turkce).';
COMMENT ON COLUMN leads.audit_strengths IS
  '[{area, note}] — isletmenin guclu yanlari.';
COMMENT ON COLUMN leads.audit_gaps IS
  '[{area, severity (1-5), note, talking_point}] — eksik/iyilestirilebilir alanlar.';
COMMENT ON COLUMN leads.audit_tier IS
  'A=yuksek harcama potansiyeli, B=orta, C=dusuk. LLM tarafindan atanir.';
COMMENT ON COLUMN leads.audit_share_slug IS
  'Public audit URL slug (nanoid 12-char). /audit/[slug] sayfasi icin.';
COMMENT ON COLUMN leads.gbp_reviews_summary IS
  '{count, avg_rating, response_rate, recent_reviews:[...]} — Outscraper ozet.';
COMMENT ON COLUMN leads.gbp_reviews_fetched_at IS
  'Cache TTL check icin (30 gun, Google Places ToS uyumlu).';
