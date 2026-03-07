-- Lead aktivite logu tablosu
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
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

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
