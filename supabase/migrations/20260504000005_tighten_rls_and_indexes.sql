-- RLS sıkılaştırma + eksik index'ler
-- Service role API'yi etkilemez (RLS bypass eder)
-- Authenticated client'lar için "herkes okur" yerine "aktif agent okuyabilir" kuralı

-- ============================================================
-- 1) DISTRICTS — herkes okur → authenticated okur
-- ============================================================
DROP POLICY IF EXISTS "Districts herkes okuyabilir" ON districts;

CREATE POLICY "Districts authenticated kullanıcılar okuyabilir"
  ON districts FOR SELECT
  TO authenticated
  USING (true);

-- ============================================================
-- 2) AGENTS — herkes okur → authenticated agent okuyabilir
-- ============================================================
DROP POLICY IF EXISTS "Agents herkes okuyabilir" ON agents;

CREATE POLICY "Agents authenticated kullanıcılar okuyabilir"
  ON agents FOR SELECT
  TO authenticated
  USING (true);

-- ============================================================
-- 3) LEADS — herkes okur → aktif agent okuyabilir
-- ============================================================
DROP POLICY IF EXISTS "Leads herkes okuyabilir" ON leads;

CREATE POLICY "Leads aktif agent okuyabilir"
  ON leads FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM agents
      WHERE user_id = auth.uid()
        AND is_active = true
    )
  );

-- ============================================================
-- 4) SCRAPE_JOBS — herkes okur → aktif agent okuyabilir
-- ============================================================
DROP POLICY IF EXISTS "Scrape jobs herkes okuyabilir" ON scrape_jobs;

CREATE POLICY "Scrape jobs aktif agent okuyabilir"
  ON scrape_jobs FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM agents
      WHERE user_id = auth.uid()
        AND is_active = true
    )
  );

-- ============================================================
-- 5) Eksik index'ler
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_leads_created_at ON leads(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_lead_activities_lead_created
  ON lead_activities(lead_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_assignments_agent_scheduled
  ON assignments(agent_id, scheduled_date DESC);

-- call_lists.items içinde JSONB containment sorguları için GIN index
CREATE INDEX IF NOT EXISTS idx_call_lists_items_gin
  ON call_lists USING GIN (items);
