-- Kazıma iş durumları
CREATE TYPE scrape_job_status AS ENUM ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED');

-- Kazıma işleri tablosu
CREATE TABLE scrape_jobs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    district_id UUID REFERENCES districts(id) ON DELETE SET NULL,
    source_adapter TEXT NOT NULL, -- 'google-places', 'apify', 'instagram'
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

-- Trigger
CREATE TRIGGER set_scrape_jobs_updated_at
    BEFORE UPDATE ON scrape_jobs
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- İndeksler
CREATE INDEX idx_scrape_jobs_district_id ON scrape_jobs(district_id);
CREATE INDEX idx_scrape_jobs_status ON scrape_jobs(status);
CREATE INDEX idx_scrape_jobs_source ON scrape_jobs(source_adapter);
CREATE INDEX idx_scrape_jobs_created_at ON scrape_jobs(created_at DESC);

-- RLS
ALTER TABLE scrape_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Scrape jobs herkes okuyabilir"
    ON scrape_jobs FOR SELECT
    USING (true);

CREATE POLICY "Scrape jobs admin yazabilir"
    ON scrape_jobs FOR ALL
    USING (
        (SELECT raw_user_meta_data->>'role' FROM auth.users WHERE id = auth.uid()) = 'ADMIN'
    );
