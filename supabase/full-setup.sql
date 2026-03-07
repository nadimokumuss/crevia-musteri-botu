-- ============================================
-- Crevia Sales OS - Tam Veritabanı Kurulumu
-- Bu dosyayı Supabase SQL Editor'de tek seferde çalıştırın.
-- ============================================

-- Önceki yarım kalmış tabloları temizle (varsa)
DROP TABLE IF EXISTS call_lists CASCADE;
DROP TABLE IF EXISTS scrape_jobs CASCADE;
DROP TABLE IF EXISTS routes CASCADE;
DROP TABLE IF EXISTS assignments CASCADE;
DROP TABLE IF EXISTS leads CASCADE;
DROP TABLE IF EXISTS agents CASCADE;
DROP TABLE IF EXISTS districts CASCADE;
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
        (SELECT raw_user_meta_data->>'role' FROM auth.users WHERE id = auth.uid()) = 'ADMIN'
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
        (SELECT raw_user_meta_data->>'role' FROM auth.users WHERE id = auth.uid()) = 'ADMIN'
    );

CREATE POLICY "Agents admin veya kendisi güncelleyebilir"
    ON agents FOR UPDATE
    USING (
        (SELECT raw_user_meta_data->>'role' FROM auth.users WHERE id = auth.uid()) = 'ADMIN'
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
    website TEXT,
    lat DOUBLE PRECISION,
    lng DOUBLE PRECISION,
    google_place_id TEXT UNIQUE,
    google_rating DOUBLE PRECISION,
    google_review_count INTEGER,
    google_photo_count INTEGER,
    google_is_claimed BOOLEAN,
    google_last_updated TIMESTAMPTZ,
    ig_username TEXT,
    ig_follower_count INTEGER,
    ig_post_count INTEGER,
    ig_avg_likes DOUBLE PRECISION,
    ig_last_post_date TIMESTAMPTZ,
    ig_has_highlights BOOLEAN,
    ig_bio_contains_agency BOOLEAN,
    need_score INTEGER DEFAULT 0 CHECK (need_score >= 0 AND need_score <= 100),
    google_sub_score INTEGER DEFAULT 0 CHECK (google_sub_score >= 0 AND google_sub_score <= 50),
    instagram_sub_score INTEGER DEFAULT 0 CHECK (instagram_sub_score >= 0 AND instagram_sub_score <= 50),
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

ALTER TABLE leads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Leads herkes okuyabilir"
    ON leads FOR SELECT
    USING (true);

CREATE POLICY "Leads admin ve ajan yazabilir"
    ON leads FOR INSERT
    WITH CHECK (
        (SELECT raw_user_meta_data->>'role' FROM auth.users WHERE id = auth.uid()) IN ('ADMIN', 'FIELD_AGENT', 'TELESALES_AGENT')
    );

CREATE POLICY "Leads admin ve ajan güncelleyebilir"
    ON leads FOR UPDATE
    USING (
        (SELECT raw_user_meta_data->>'role' FROM auth.users WHERE id = auth.uid()) IN ('ADMIN', 'FIELD_AGENT', 'TELESALES_AGENT')
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
    CONSTRAINT unique_lead_date_type UNIQUE (lead_id, scheduled_date, assignment_type)
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

ALTER TABLE assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Assignments admin herşeyi görebilir"
    ON assignments FOR SELECT
    USING (
        (SELECT raw_user_meta_data->>'role' FROM auth.users WHERE id = auth.uid()) = 'ADMIN'
    );

CREATE POLICY "Assignments ajan kendi atamalarını görebilir"
    ON assignments FOR SELECT
    USING (
        agent_id IN (SELECT id FROM agents WHERE user_id = auth.uid())
    );

CREATE POLICY "Assignments admin yazabilir"
    ON assignments FOR INSERT
    WITH CHECK (
        (SELECT raw_user_meta_data->>'role' FROM auth.users WHERE id = auth.uid()) = 'ADMIN'
    );

CREATE POLICY "Assignments admin veya atanan ajan güncelleyebilir"
    ON assignments FOR UPDATE
    USING (
        (SELECT raw_user_meta_data->>'role' FROM auth.users WHERE id = auth.uid()) = 'ADMIN'
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
        (SELECT raw_user_meta_data->>'role' FROM auth.users WHERE id = auth.uid()) = 'ADMIN'
    );

CREATE POLICY "Routes ajan kendi rotalarını görebilir"
    ON routes FOR SELECT
    USING (
        agent_id IN (SELECT id FROM agents WHERE user_id = auth.uid())
    );

CREATE POLICY "Routes admin yazabilir"
    ON routes FOR ALL
    USING (
        (SELECT raw_user_meta_data->>'role' FROM auth.users WHERE id = auth.uid()) = 'ADMIN'
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
        (SELECT raw_user_meta_data->>'role' FROM auth.users WHERE id = auth.uid()) = 'ADMIN'
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
        (SELECT raw_user_meta_data->>'role' FROM auth.users WHERE id = auth.uid()) = 'ADMIN'
    );

CREATE POLICY "Call lists ajan kendi listelerini görebilir"
    ON call_lists FOR SELECT
    USING (
        agent_id IN (SELECT id FROM agents WHERE user_id = auth.uid())
    );

CREATE POLICY "Call lists admin yazabilir"
    ON call_lists FOR ALL
    USING (
        (SELECT raw_user_meta_data->>'role' FROM auth.users WHERE id = auth.uid()) = 'ADMIN'
    );

CREATE POLICY "Call lists ajan kendi listelerini güncelleyebilir"
    ON call_lists FOR UPDATE
    USING (
        agent_id IN (SELECT id FROM agents WHERE user_id = auth.uid())
    );
