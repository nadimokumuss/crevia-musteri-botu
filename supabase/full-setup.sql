-- ============================================
-- Crevia Sales OS - Tam Veritabanı Kurulumu
-- Bu dosyayı Supabase SQL Editor'de tek seferde çalıştırın.
-- ============================================

-- Önceki yarım kalmış tabloları temizle (varsa)
DROP TABLE IF EXISTS call_lists CASCADE;
DROP TABLE IF EXISTS scrape_jobs CASCADE;
DROP TABLE IF EXISTS routes CASCADE;
DROP TABLE IF EXISTS assignments CASCADE;
DROP TABLE IF EXISTS lead_activities CASCADE;
DROP TABLE IF EXISTS weekly_plans CASCADE;
DROP TABLE IF EXISTS agent_preferences CASCADE;
DROP TABLE IF EXISTS leads CASCADE;
DROP TABLE IF EXISTS agents CASCADE;
DROP TABLE IF EXISTS districts CASCADE;
DROP TYPE IF EXISTS activity_type CASCADE;
DROP TYPE IF EXISTS weekly_plan_status CASCADE;
DROP TYPE IF EXISTS scrape_job_status CASCADE;
DROP TYPE IF EXISTS assignment_status CASCADE;
DROP TYPE IF EXISTS assignment_type CASCADE;
DROP TYPE IF EXISTS lead_recommendation CASCADE;
DROP TYPE IF EXISTS lead_status CASCADE;
DROP TYPE IF EXISTS agent_role CASCADE;

-- ============================================
-- 1. Extensions + Trigger Fonksiyonu
-- ============================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- ============================================
-- 2. Districts (İlçeler)
-- ============================================
CREATE TABLE districts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL UNIQUE,
    lat DOUBLE PRECISION NOT NULL,
    lng DOUBLE PRECISION NOT NULL,
    polygon JSONB,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER set_districts_updated_at
    BEFORE UPDATE ON districts
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE INDEX idx_districts_is_active ON districts(is_active);
CREATE INDEX idx_districts_name ON districts(name);

ALTER TABLE districts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Districts herkes okuyabilir"
    ON districts FOR SELECT
    USING (true);

CREATE POLICY "Districts sadece admin yazabilir"
    ON districts FOR ALL
    USING (
        ((auth.jwt() -> 'user_metadata') ->> 'role') = 'ADMIN'
    );

-- ============================================
-- 3. Agents (Ajanlar)
-- ============================================
CREATE TYPE agent_role AS ENUM ('ADMIN', 'FIELD_AGENT', 'TELESALES_AGENT');

CREATE TABLE agents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    full_name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    phone TEXT,
    role agent_role NOT NULL DEFAULT 'FIELD_AGENT',
    base_lat DOUBLE PRECISION,
    base_lng DOUBLE PRECISION,
    max_daily_visits INTEGER NOT NULL DEFAULT 10,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER set_agents_updated_at
    BEFORE UPDATE ON agents
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE INDEX idx_agents_role ON agents(role);
CREATE INDEX idx_agents_is_active ON agents(is_active);
CREATE INDEX idx_agents_user_id ON agents(user_id);

ALTER TABLE agents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Agents herkes okuyabilir"
    ON agents FOR SELECT
    USING (true);

CREATE POLICY "Agents admin yazabilir"
    ON agents FOR INSERT
    WITH CHECK (
        ((auth.jwt() -> 'user_metadata') ->> 'role') = 'ADMIN'
    );

CREATE POLICY "Agents admin veya kendisi güncelleyebilir"
    ON agents FOR UPDATE
    USING (
        ((auth.jwt() -> 'user_metadata') ->> 'role') = 'ADMIN'
        OR user_id = auth.uid()
    );

-- ============================================
-- 4. Leads (Potansiyel Müşteriler)
-- ============================================
CREATE TYPE lead_status AS ENUM ('NEW', 'CONTACTED', 'QUALIFIED', 'PROPOSAL', 'WON', 'LOST', 'SKIP');
CREATE TYPE lead_recommendation AS ENUM ('HIGH_PRIORITY', 'MEDIUM', 'LOW_PRIORITY', 'SKIP');

CREATE TABLE leads (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    district_id UUID REFERENCES districts(id) ON DELETE SET NULL,
    business_name TEXT NOT NULL,
    category TEXT,
    address TEXT,
    phone TEXT,
    email TEXT,
    website TEXT,
    lat DOUBLE PRECISION,
    lng DOUBLE PRECISION,
    google_place_id TEXT UNIQUE,
    google_rating DOUBLE PRECISION,
    google_review_count INTEGER,
    google_photo_count INTEGER,
    google_is_claimed BOOLEAN,
    google_last_updated TIMESTAMPTZ,
    google_response_rate DOUBLE PRECISION,
    ig_username TEXT,
    ig_discovery_source TEXT CHECK (ig_discovery_source IN ('WEBSITE_URL', 'WEBSITE_HTML', 'CANDIDATE_VERIFIED', 'MANUAL')),
    ig_follower_count INTEGER,
    ig_post_count INTEGER,
    ig_avg_likes DOUBLE PRECISION,
    ig_last_post_date TIMESTAMPTZ,
    ig_has_highlights BOOLEAN,
    ig_bio_contains_agency BOOLEAN,
    ig_has_bio_link BOOLEAN,
    ig_posting_regularity TEXT CHECK (ig_posting_regularity IN ('regular', 'irregular', 'gaps', 'dead')),
    ig_engagement_rate DOUBLE PRECISION,
    ig_reels_ratio DOUBLE PRECISION,
    website_speed_score DOUBLE PRECISION,
    website_is_mobile_friendly BOOLEAN,
    website_has_404s BOOLEAN,
    website_has_meta_pixel BOOLEAN,
    website_has_ga4 BOOLEAN,
    has_active_meta_ads BOOLEAN,
    email_source TEXT CHECK (email_source IN ('website', 'google', 'instagram', 'manual')),
    need_score INTEGER DEFAULT 0 CHECK (need_score >= 0 AND need_score <= 100),
    google_sub_score INTEGER DEFAULT 0 CHECK (google_sub_score >= 0 AND google_sub_score <= 30),
    instagram_sub_score INTEGER DEFAULT 0 CHECK (instagram_sub_score >= 0 AND instagram_sub_score <= 30),
    website_sub_score INTEGER DEFAULT 0 CHECK (website_sub_score >= 0 AND website_sub_score <= 30),
    marketing_sub_score INTEGER DEFAULT 0 CHECK (marketing_sub_score >= 0 AND marketing_sub_score <= 20),
    recommendation lead_recommendation DEFAULT 'SKIP',
    status lead_status NOT NULL DEFAULT 'NEW',
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER set_leads_updated_at
    BEFORE UPDATE ON leads
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE INDEX idx_leads_district_id ON leads(district_id);
CREATE INDEX idx_leads_status ON leads(status);
CREATE INDEX idx_leads_need_score ON leads(need_score DESC);
CREATE INDEX idx_leads_recommendation ON leads(recommendation);
CREATE INDEX idx_leads_lat_lng ON leads(lat, lng);
CREATE INDEX idx_leads_google_place_id ON leads(google_place_id);
CREATE INDEX idx_leads_business_name ON leads(business_name);
CREATE INDEX idx_leads_ig_discovery_source ON leads(ig_discovery_source);

ALTER TABLE leads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Leads herkes okuyabilir"
    ON leads FOR SELECT
    USING (true);

CREATE POLICY "Leads admin ve ajan yazabilir"
    ON leads FOR INSERT
    WITH CHECK (
        ((auth.jwt() -> 'user_metadata') ->> 'role') IN ('ADMIN', 'FIELD_AGENT', 'TELESALES_AGENT')
    );

CREATE POLICY "Leads admin ve ajan güncelleyebilir"
    ON leads FOR UPDATE
    USING (
        ((auth.jwt() -> 'user_metadata') ->> 'role') IN ('ADMIN', 'FIELD_AGENT', 'TELESALES_AGENT')
    );

-- ============================================
-- 5. Assignments (Atamalar)
-- ============================================
CREATE TYPE assignment_type AS ENUM ('VISIT', 'CALL');
CREATE TYPE assignment_status AS ENUM ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'NO_SHOW');

CREATE TABLE assignments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
    agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    assignment_type assignment_type NOT NULL,
    scheduled_date DATE NOT NULL,
    status assignment_status NOT NULL DEFAULT 'PENDING',
    outcome TEXT,
    notes TEXT,
    locked_at TIMESTAMPTZ,
    lock_expires_at TIMESTAMPTZ,
    locked_by UUID REFERENCES agents(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unique_lead_single_assignment UNIQUE (lead_id)
);

CREATE TRIGGER set_assignments_updated_at
    BEFORE UPDATE ON assignments
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE INDEX idx_assignments_lead_id ON assignments(lead_id);
CREATE INDEX idx_assignments_agent_id ON assignments(agent_id);
CREATE INDEX idx_assignments_scheduled_date ON assignments(scheduled_date);
CREATE INDEX idx_assignments_status ON assignments(status);
CREATE INDEX idx_assignments_type ON assignments(assignment_type);
CREATE INDEX idx_assignments_agent_date ON assignments(agent_id, scheduled_date);
CREATE INDEX idx_assignments_lead_unique ON assignments(lead_id);

ALTER TABLE assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Assignments admin herşeyi görebilir"
    ON assignments FOR SELECT
    USING (
        ((auth.jwt() -> 'user_metadata') ->> 'role') = 'ADMIN'
    );

CREATE POLICY "Assignments ajan kendi atamalarını görebilir"
    ON assignments FOR SELECT
    USING (
        agent_id IN (SELECT id FROM agents WHERE user_id = auth.uid())
    );

CREATE POLICY "Assignments admin yazabilir"
    ON assignments FOR INSERT
    WITH CHECK (
        ((auth.jwt() -> 'user_metadata') ->> 'role') = 'ADMIN'
    );

CREATE POLICY "Assignments admin veya atanan ajan güncelleyebilir"
    ON assignments FOR UPDATE
    USING (
        ((auth.jwt() -> 'user_metadata') ->> 'role') = 'ADMIN'
        OR agent_id IN (SELECT id FROM agents WHERE user_id = auth.uid())
    );

-- ============================================
-- 6. Routes (Günlük Saha Rotaları)
-- ============================================
CREATE TABLE routes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    route_date DATE NOT NULL,
    stops JSONB NOT NULL DEFAULT '[]'::jsonb,
    total_distance_km DOUBLE PRECISION DEFAULT 0,
    estimated_duration_min INTEGER DEFAULT 0,
    polyline TEXT,
    is_optimized BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unique_agent_route_date UNIQUE (agent_id, route_date)
);

CREATE TRIGGER set_routes_updated_at
    BEFORE UPDATE ON routes
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE INDEX idx_routes_agent_id ON routes(agent_id);
CREATE INDEX idx_routes_route_date ON routes(route_date);
CREATE INDEX idx_routes_agent_date ON routes(agent_id, route_date);

ALTER TABLE routes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Routes admin herşeyi görebilir"
    ON routes FOR SELECT
    USING (
        ((auth.jwt() -> 'user_metadata') ->> 'role') = 'ADMIN'
    );

CREATE POLICY "Routes ajan kendi rotalarını görebilir"
    ON routes FOR SELECT
    USING (
        agent_id IN (SELECT id FROM agents WHERE user_id = auth.uid())
    );

CREATE POLICY "Routes admin yazabilir"
    ON routes FOR ALL
    USING (
        ((auth.jwt() -> 'user_metadata') ->> 'role') = 'ADMIN'
    );

-- ============================================
-- 7. Scrape Jobs (Kazıma İşleri)
-- ============================================
CREATE TYPE scrape_job_status AS ENUM ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED');

CREATE TABLE scrape_jobs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    district_id UUID REFERENCES districts(id) ON DELETE SET NULL,
    source_adapter TEXT NOT NULL,
    category TEXT,
    status scrape_job_status NOT NULL DEFAULT 'PENDING',
    leads_found INTEGER DEFAULT 0,
    leads_new INTEGER DEFAULT 0,
    leads_updated INTEGER DEFAULT 0,
    error_message TEXT,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER set_scrape_jobs_updated_at
    BEFORE UPDATE ON scrape_jobs
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE INDEX idx_scrape_jobs_district_id ON scrape_jobs(district_id);
CREATE INDEX idx_scrape_jobs_status ON scrape_jobs(status);
CREATE INDEX idx_scrape_jobs_source ON scrape_jobs(source_adapter);
CREATE INDEX idx_scrape_jobs_created_at ON scrape_jobs(created_at DESC);

ALTER TABLE scrape_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Scrape jobs herkes okuyabilir"
    ON scrape_jobs FOR SELECT
    USING (true);

CREATE POLICY "Scrape jobs admin yazabilir"
    ON scrape_jobs FOR ALL
    USING (
        ((auth.jwt() -> 'user_metadata') ->> 'role') = 'ADMIN'
    );

-- ============================================
-- 8. Call Lists (Günlük Arama Listeleri)
-- ============================================
CREATE TABLE call_lists (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    list_date DATE NOT NULL,
    items JSONB NOT NULL DEFAULT '[]'::jsonb,
    total_items INTEGER NOT NULL DEFAULT 0,
    completed_items INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unique_agent_call_date UNIQUE (agent_id, list_date)
);

CREATE TRIGGER set_call_lists_updated_at
    BEFORE UPDATE ON call_lists
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE INDEX idx_call_lists_agent_id ON call_lists(agent_id);
CREATE INDEX idx_call_lists_list_date ON call_lists(list_date);
CREATE INDEX idx_call_lists_agent_date ON call_lists(agent_id, list_date);

ALTER TABLE call_lists ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Call lists admin herşeyi görebilir"
    ON call_lists FOR SELECT
    USING (
        ((auth.jwt() -> 'user_metadata') ->> 'role') = 'ADMIN'
    );

CREATE POLICY "Call lists ajan kendi listelerini görebilir"
    ON call_lists FOR SELECT
    USING (
        agent_id IN (SELECT id FROM agents WHERE user_id = auth.uid())
    );

CREATE POLICY "Call lists admin yazabilir"
    ON call_lists FOR ALL
    USING (
        ((auth.jwt() -> 'user_metadata') ->> 'role') = 'ADMIN'
    );

CREATE POLICY "Call lists ajan kendi listelerini güncelleyebilir"
    ON call_lists FOR UPDATE
    USING (
        agent_id IN (SELECT id FROM agents WHERE user_id = auth.uid())
    );

-- ============================================
-- 9. Agent Preferences (Ajan Tercihleri)
-- ============================================
CREATE TABLE agent_preferences (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    agent_id UUID NOT NULL UNIQUE REFERENCES agents(id) ON DELETE CASCADE,
    district_ids UUID[] DEFAULT '{}',
    categories TEXT[] DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER set_agent_preferences_updated_at
    BEFORE UPDATE ON agent_preferences
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE agent_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Agent preferences herkes okuyabilir"
    ON agent_preferences FOR SELECT
    USING (true);

CREATE POLICY "Agent preferences admin yazabilir"
    ON agent_preferences FOR ALL
    USING (
        ((auth.jwt() -> 'user_metadata') ->> 'role') = 'ADMIN'
    );

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
-- 10. Weekly Plans (Legacy Haftalık Plan)
-- ============================================
CREATE TYPE weekly_plan_status AS ENUM ('SCRAPING', 'DISTRIBUTING', 'COMPLETED', 'FAILED');

CREATE TABLE weekly_plans (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    week_start DATE NOT NULL UNIQUE,
    status weekly_plan_status NOT NULL DEFAULT 'SCRAPING',
    scrape_job_ids UUID[] DEFAULT '{}',
    total_scrape_jobs INTEGER DEFAULT 0,
    completed_scrape_jobs INTEGER DEFAULT 0,
    distribution_stats JSONB,
    error_message TEXT,
    created_by UUID REFERENCES agents(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER set_weekly_plans_updated_at
    BEFORE UPDATE ON weekly_plans
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE weekly_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Weekly plans herkes okuyabilir"
    ON weekly_plans FOR SELECT
    USING (true);

CREATE POLICY "Weekly plans admin yazabilir"
    ON weekly_plans FOR ALL
    USING (
        ((auth.jwt() -> 'user_metadata') ->> 'role') = 'ADMIN'
    );

ALTER TABLE scrape_jobs
ADD COLUMN weekly_plan_id UUID REFERENCES weekly_plans(id) ON DELETE SET NULL;

-- ============================================
-- 11. Lead Activities (Lead Aktivite Geçmişi)
-- ============================================
CREATE TYPE activity_type AS ENUM (
    'STATUS_CHANGE',
    'ASSIGNMENT_CREATED',
    'ASSIGNMENT_UPDATED',
    'CALL_LOGGED',
    'VISIT_LOGGED',
    'SCORE_CALCULATED',
    'NOTE_ADDED',
    'LEAD_CREATED'
);

CREATE TABLE lead_activities (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
    activity_type activity_type NOT NULL,
    agent_id UUID REFERENCES agents(id) ON DELETE SET NULL,
    description TEXT NOT NULL,
    old_value TEXT,
    new_value TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER set_lead_activities_updated_at
    BEFORE UPDATE ON lead_activities
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE INDEX idx_lead_activities_lead_id ON lead_activities(lead_id);
CREATE INDEX idx_lead_activities_created_at ON lead_activities(created_at);
CREATE INDEX idx_lead_activities_type ON lead_activities(activity_type);

ALTER TABLE lead_activities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Lead activities okunabilir"
    ON lead_activities FOR SELECT
    USING (
        ((auth.jwt() -> 'user_metadata') ->> 'role') IN ('ADMIN', 'FIELD_AGENT', 'TELESALES_AGENT')
    );

CREATE POLICY "Lead activities admin yazabilir"
    ON lead_activities FOR INSERT
    WITH CHECK (
        ((auth.jwt() -> 'user_metadata') ->> 'role') = 'ADMIN'
    );
