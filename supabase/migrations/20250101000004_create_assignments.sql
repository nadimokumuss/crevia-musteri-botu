-- Atama tipleri
CREATE TYPE assignment_type AS ENUM ('VISIT', 'CALL');
CREATE TYPE assignment_status AS ENUM ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'NO_SHOW');

-- Lead-ajan ataması tablosu
CREATE TABLE assignments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
    agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    assignment_type assignment_type NOT NULL,
    scheduled_date DATE NOT NULL,
    status assignment_status NOT NULL DEFAULT 'PENDING',
    outcome TEXT,
    notes TEXT,

    -- Çatışma önleme kilidi
    locked_at TIMESTAMPTZ,
    lock_expires_at TIMESTAMPTZ,
    locked_by UUID REFERENCES agents(id),

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Çatışma önleme: aynı lead, aynı gün, aynı tip için tek atama
    CONSTRAINT unique_lead_date_type UNIQUE (lead_id, scheduled_date, assignment_type)
);

-- Trigger
CREATE TRIGGER set_assignments_updated_at
    BEFORE UPDATE ON assignments
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- İndeksler
CREATE INDEX idx_assignments_lead_id ON assignments(lead_id);
CREATE INDEX idx_assignments_agent_id ON assignments(agent_id);
CREATE INDEX idx_assignments_scheduled_date ON assignments(scheduled_date);
CREATE INDEX idx_assignments_status ON assignments(status);
CREATE INDEX idx_assignments_type ON assignments(assignment_type);
CREATE INDEX idx_assignments_agent_date ON assignments(agent_id, scheduled_date);

-- RLS
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
