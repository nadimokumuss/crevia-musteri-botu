-- Günlük arama listeleri tablosu
CREATE TABLE call_lists (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    list_date DATE NOT NULL,
    items JSONB NOT NULL DEFAULT '[]'::jsonb,
    -- items format: [{ "lead_id": "uuid", "order": 1, "status": "PENDING", "outcome": null }]
    total_items INTEGER NOT NULL DEFAULT 0,
    completed_items INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT unique_agent_call_date UNIQUE (agent_id, list_date)
);

-- Trigger
CREATE TRIGGER set_call_lists_updated_at
    BEFORE UPDATE ON call_lists
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- İndeksler
CREATE INDEX idx_call_lists_agent_id ON call_lists(agent_id);
CREATE INDEX idx_call_lists_list_date ON call_lists(list_date);
CREATE INDEX idx_call_lists_agent_date ON call_lists(agent_id, list_date);

-- RLS
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
