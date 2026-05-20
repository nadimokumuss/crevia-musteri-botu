-- Faz 0: Multi-tenant temeli
-- ==========================
-- Bu migration:
--   1. tenants tablosunu olusturur (RLS aktif, ADMIN okuyabilir/yazabilir)
--   2. Default tenant seed eder (deterministic UUID)
--   3. 9 ana tabloya nullable tenant_id kolonu ekler
--   4. Mevcut tum satirlari default tenant'a baglar
--   5. tenant_id icin index ekler
--
-- Faz 0'da bu kolon HENUZ KULLANILMAZ. RLS izolasyonu, NOT NULL constraint
-- ve TS type'larina yansitma Faz 3'te (multi-tenant aktivasyon) yapilacak.
-- Bu migration geri alinabilir; yalnizca yeni kolon + tablo + seed.

-- ============================================
-- 1) tenants tablosu
-- ============================================
CREATE TABLE IF NOT EXISTS tenants (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER set_tenants_updated_at
    BEFORE UPDATE ON tenants
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenants admin okur"
    ON tenants FOR SELECT
    USING (((auth.jwt() -> 'user_metadata') ->> 'role') = 'ADMIN');

CREATE POLICY "Tenants admin yazar"
    ON tenants FOR ALL
    USING (((auth.jwt() -> 'user_metadata') ->> 'role') = 'ADMIN');

COMMENT ON TABLE tenants IS
    'Multi-tenant foundation (Faz 0). Faz 3''te RLS izolasyonu ve NOT NULL eklenecek.';
COMMENT ON COLUMN tenants.slug IS
    'URL-safe tenant tanimlayicisi (or. ajans-x.crevia.com).';

-- ============================================
-- 2) Default tenant seed
-- ============================================
INSERT INTO tenants (id, name, slug)
VALUES ('00000000-0000-0000-0000-000000000001', 'Default', 'default')
ON CONFLICT (id) DO NOTHING;

-- ============================================
-- 3) tenant_id kolonu (9 ana tablo)
-- ============================================

-- agents
ALTER TABLE agents
    ADD COLUMN IF NOT EXISTS tenant_id UUID
    REFERENCES tenants(id) ON DELETE RESTRICT
    DEFAULT '00000000-0000-0000-0000-000000000001';
UPDATE agents SET tenant_id = '00000000-0000-0000-0000-000000000001'
    WHERE tenant_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_agents_tenant_id ON agents(tenant_id);

-- leads
ALTER TABLE leads
    ADD COLUMN IF NOT EXISTS tenant_id UUID
    REFERENCES tenants(id) ON DELETE RESTRICT
    DEFAULT '00000000-0000-0000-0000-000000000001';
UPDATE leads SET tenant_id = '00000000-0000-0000-0000-000000000001'
    WHERE tenant_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_leads_tenant_id ON leads(tenant_id);

-- assignments
ALTER TABLE assignments
    ADD COLUMN IF NOT EXISTS tenant_id UUID
    REFERENCES tenants(id) ON DELETE RESTRICT
    DEFAULT '00000000-0000-0000-0000-000000000001';
UPDATE assignments SET tenant_id = '00000000-0000-0000-0000-000000000001'
    WHERE tenant_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_assignments_tenant_id ON assignments(tenant_id);

-- call_lists
ALTER TABLE call_lists
    ADD COLUMN IF NOT EXISTS tenant_id UUID
    REFERENCES tenants(id) ON DELETE RESTRICT
    DEFAULT '00000000-0000-0000-0000-000000000001';
UPDATE call_lists SET tenant_id = '00000000-0000-0000-0000-000000000001'
    WHERE tenant_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_call_lists_tenant_id ON call_lists(tenant_id);

-- lead_activities
ALTER TABLE lead_activities
    ADD COLUMN IF NOT EXISTS tenant_id UUID
    REFERENCES tenants(id) ON DELETE RESTRICT
    DEFAULT '00000000-0000-0000-0000-000000000001';
UPDATE lead_activities SET tenant_id = '00000000-0000-0000-0000-000000000001'
    WHERE tenant_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_lead_activities_tenant_id ON lead_activities(tenant_id);

-- scrape_jobs
ALTER TABLE scrape_jobs
    ADD COLUMN IF NOT EXISTS tenant_id UUID
    REFERENCES tenants(id) ON DELETE RESTRICT
    DEFAULT '00000000-0000-0000-0000-000000000001';
UPDATE scrape_jobs SET tenant_id = '00000000-0000-0000-0000-000000000001'
    WHERE tenant_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_scrape_jobs_tenant_id ON scrape_jobs(tenant_id);

-- agent_preferences
ALTER TABLE agent_preferences
    ADD COLUMN IF NOT EXISTS tenant_id UUID
    REFERENCES tenants(id) ON DELETE RESTRICT
    DEFAULT '00000000-0000-0000-0000-000000000001';
UPDATE agent_preferences SET tenant_id = '00000000-0000-0000-0000-000000000001'
    WHERE tenant_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_agent_preferences_tenant_id ON agent_preferences(tenant_id);

-- weekly_plans
ALTER TABLE weekly_plans
    ADD COLUMN IF NOT EXISTS tenant_id UUID
    REFERENCES tenants(id) ON DELETE RESTRICT
    DEFAULT '00000000-0000-0000-0000-000000000001';
UPDATE weekly_plans SET tenant_id = '00000000-0000-0000-0000-000000000001'
    WHERE tenant_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_weekly_plans_tenant_id ON weekly_plans(tenant_id);

-- routes (legacy tablo, ileride saha modulu icin korunur)
ALTER TABLE routes
    ADD COLUMN IF NOT EXISTS tenant_id UUID
    REFERENCES tenants(id) ON DELETE RESTRICT
    DEFAULT '00000000-0000-0000-0000-000000000001';
UPDATE routes SET tenant_id = '00000000-0000-0000-0000-000000000001'
    WHERE tenant_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_routes_tenant_id ON routes(tenant_id);
