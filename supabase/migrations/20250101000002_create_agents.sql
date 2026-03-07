-- Ajan rolleri
CREATE TYPE agent_role AS ENUM ('ADMIN', 'FIELD_AGENT', 'TELESALES_AGENT');

-- Satış ekibi tablosu
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

-- Trigger
CREATE TRIGGER set_agents_updated_at
    BEFORE UPDATE ON agents
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- İndeksler
CREATE INDEX idx_agents_role ON agents(role);
CREATE INDEX idx_agents_is_active ON agents(is_active);
CREATE INDEX idx_agents_user_id ON agents(user_id);

-- RLS
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
