-- Haftalık Plan Sistemi: agent_preferences + weekly_plans tabloları

-- ============================================
-- weekly_plan_status ENUM
-- ============================================
CREATE TYPE weekly_plan_status AS ENUM ('SCRAPING', 'DISTRIBUTING', 'COMPLETED', 'FAILED');

-- ============================================
-- agent_preferences
-- ============================================
CREATE TABLE agent_preferences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id UUID NOT NULL UNIQUE REFERENCES agents(id) ON DELETE CASCADE,
    district_ids UUID[] DEFAULT '{}',
    categories TEXT[] DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE agent_preferences ENABLE ROW LEVEL SECURITY;

-- Herkes okuyabilir
CREATE POLICY "Agent preferences herkes okuyabilir"
    ON agent_preferences FOR SELECT
    USING (true);

-- Admin tüm CRUD
CREATE POLICY "Agent preferences admin yazabilir"
    ON agent_preferences FOR ALL
    USING (
        ((auth.jwt() -> 'user_metadata') ->> 'role') = 'ADMIN'
    );

-- Ajan kendini insert/update edebilir
CREATE POLICY "Agent preferences ajan kendini güncelleyebilir"
    ON agent_preferences FOR INSERT
    WITH CHECK (
        agent_id IN (SELECT id FROM agents WHERE user_id = auth.uid())
    );

CREATE POLICY "Agent preferences ajan kendini update edebilir"
    ON agent_preferences FOR UPDATE
    USING (
        agent_id IN (SELECT id FROM agents WHERE user_id = auth.uid())
    );

-- ============================================
-- weekly_plans
-- ============================================
CREATE TABLE weekly_plans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    week_start DATE NOT NULL UNIQUE,
    status weekly_plan_status NOT NULL DEFAULT 'SCRAPING',
    scrape_job_ids UUID[] DEFAULT '{}',
    total_scrape_jobs INTEGER DEFAULT 0,
    completed_scrape_jobs INTEGER DEFAULT 0,
    distribution_stats JSONB,
    error_message TEXT,
    created_by UUID REFERENCES agents(id),
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE weekly_plans ENABLE ROW LEVEL SECURITY;

-- Herkes okuyabilir
CREATE POLICY "Weekly plans herkes okuyabilir"
    ON weekly_plans FOR SELECT
    USING (true);

-- Admin yazabilir
CREATE POLICY "Weekly plans admin yazabilir"
    ON weekly_plans FOR ALL
    USING (
        ((auth.jwt() -> 'user_metadata') ->> 'role') = 'ADMIN'
    );

-- ============================================
-- scrape_jobs: weekly_plan_id kolonu ekle
-- ============================================
ALTER TABLE scrape_jobs ADD COLUMN weekly_plan_id UUID REFERENCES weekly_plans(id) ON DELETE SET NULL;
