-- RLS politikalarını düzelt: auth.users subquery yerine auth.jwt() kullan
-- Bu, "permission denied for table users" hatasını çözer

-- ============================================
-- Districts
-- ============================================
DROP POLICY IF EXISTS "Districts sadece admin yazabilir" ON districts;
CREATE POLICY "Districts sadece admin yazabilir"
    ON districts FOR ALL
    USING (
        ((auth.jwt() -> 'user_metadata') ->> 'role') = 'ADMIN'
    );

-- ============================================
-- Agents
-- ============================================
DROP POLICY IF EXISTS "Agents admin yazabilir" ON agents;
CREATE POLICY "Agents admin yazabilir"
    ON agents FOR INSERT
    WITH CHECK (
        ((auth.jwt() -> 'user_metadata') ->> 'role') = 'ADMIN'
    );

DROP POLICY IF EXISTS "Agents admin veya kendisi güncelleyebilir" ON agents;
CREATE POLICY "Agents admin veya kendisi güncelleyebilir"
    ON agents FOR UPDATE
    USING (
        ((auth.jwt() -> 'user_metadata') ->> 'role') = 'ADMIN'
        OR user_id = auth.uid()
    );

-- ============================================
-- Leads
-- ============================================
DROP POLICY IF EXISTS "Leads admin ve ajan yazabilir" ON leads;
CREATE POLICY "Leads admin ve ajan yazabilir"
    ON leads FOR INSERT
    WITH CHECK (
        ((auth.jwt() -> 'user_metadata') ->> 'role') IN ('ADMIN', 'FIELD_AGENT', 'TELESALES_AGENT')
    );

DROP POLICY IF EXISTS "Leads admin ve ajan güncelleyebilir" ON leads;
CREATE POLICY "Leads admin ve ajan güncelleyebilir"
    ON leads FOR UPDATE
    USING (
        ((auth.jwt() -> 'user_metadata') ->> 'role') IN ('ADMIN', 'FIELD_AGENT', 'TELESALES_AGENT')
    );

-- ============================================
-- Assignments
-- ============================================
DROP POLICY IF EXISTS "Assignments admin herşeyi görebilir" ON assignments;
CREATE POLICY "Assignments admin herşeyi görebilir"
    ON assignments FOR SELECT
    USING (
        ((auth.jwt() -> 'user_metadata') ->> 'role') = 'ADMIN'
    );

DROP POLICY IF EXISTS "Assignments ajan kendi atamalarını görebilir" ON assignments;
CREATE POLICY "Assignments ajan kendi atamalarını görebilir"
    ON assignments FOR SELECT
    USING (
        agent_id IN (SELECT id FROM agents WHERE user_id = auth.uid())
    );

DROP POLICY IF EXISTS "Assignments admin yazabilir" ON assignments;
CREATE POLICY "Assignments admin yazabilir"
    ON assignments FOR INSERT
    WITH CHECK (
        ((auth.jwt() -> 'user_metadata') ->> 'role') = 'ADMIN'
    );

DROP POLICY IF EXISTS "Assignments admin veya atanan ajan güncelleyebilir" ON assignments;
CREATE POLICY "Assignments admin veya atanan ajan güncelleyebilir"
    ON assignments FOR UPDATE
    USING (
        ((auth.jwt() -> 'user_metadata') ->> 'role') = 'ADMIN'
        OR agent_id IN (SELECT id FROM agents WHERE user_id = auth.uid())
    );

-- ============================================
-- Routes
-- ============================================
DROP POLICY IF EXISTS "Routes admin herşeyi görebilir" ON routes;
CREATE POLICY "Routes admin herşeyi görebilir"
    ON routes FOR SELECT
    USING (
        ((auth.jwt() -> 'user_metadata') ->> 'role') = 'ADMIN'
    );

DROP POLICY IF EXISTS "Routes ajan kendi rotalarını görebilir" ON routes;
CREATE POLICY "Routes ajan kendi rotalarını görebilir"
    ON routes FOR SELECT
    USING (
        agent_id IN (SELECT id FROM agents WHERE user_id = auth.uid())
    );

DROP POLICY IF EXISTS "Routes admin yazabilir" ON routes;
CREATE POLICY "Routes admin yazabilir"
    ON routes FOR ALL
    USING (
        ((auth.jwt() -> 'user_metadata') ->> 'role') = 'ADMIN'
    );

-- ============================================
-- Scrape Jobs
-- ============================================
DROP POLICY IF EXISTS "Scrape jobs admin yazabilir" ON scrape_jobs;
CREATE POLICY "Scrape jobs admin yazabilir"
    ON scrape_jobs FOR ALL
    USING (
        ((auth.jwt() -> 'user_metadata') ->> 'role') = 'ADMIN'
    );

-- ============================================
-- Call Lists
-- ============================================
DROP POLICY IF EXISTS "Call lists admin herşeyi görebilir" ON call_lists;
CREATE POLICY "Call lists admin herşeyi görebilir"
    ON call_lists FOR SELECT
    USING (
        ((auth.jwt() -> 'user_metadata') ->> 'role') = 'ADMIN'
    );

DROP POLICY IF EXISTS "Call lists ajan kendi listelerini görebilir" ON call_lists;
CREATE POLICY "Call lists ajan kendi listelerini görebilir"
    ON call_lists FOR SELECT
    USING (
        agent_id IN (SELECT id FROM agents WHERE user_id = auth.uid())
    );

DROP POLICY IF EXISTS "Call lists admin yazabilir" ON call_lists;
CREATE POLICY "Call lists admin yazabilir"
    ON call_lists FOR ALL
    USING (
        ((auth.jwt() -> 'user_metadata') ->> 'role') = 'ADMIN'
    );

DROP POLICY IF EXISTS "Call lists ajan kendi listelerini güncelleyebilir" ON call_lists;
CREATE POLICY "Call lists ajan kendi listelerini güncelleyebilir"
    ON call_lists FOR UPDATE
    USING (
        agent_id IN (SELECT id FROM agents WHERE user_id = auth.uid())
    );
