ALTER TABLE leads
ADD COLUMN IF NOT EXISTS ig_discovery_source TEXT
CHECK (ig_discovery_source IN ('WEBSITE_URL', 'WEBSITE_HTML', 'CANDIDATE_VERIFIED', 'MANUAL'));

CREATE INDEX IF NOT EXISTS idx_leads_ig_discovery_source
ON leads(ig_discovery_source);
