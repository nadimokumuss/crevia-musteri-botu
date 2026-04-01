-- updated_at trigger zorunluluğunu yeni tablolar için hizala

ALTER TABLE agent_preferences
ALTER COLUMN created_at SET DEFAULT NOW();

ALTER TABLE agent_preferences
ALTER COLUMN updated_at SET DEFAULT NOW();

UPDATE agent_preferences
SET updated_at = COALESCE(updated_at, created_at, NOW())
WHERE updated_at IS NULL;

ALTER TABLE agent_preferences
ALTER COLUMN updated_at SET NOT NULL;

DROP TRIGGER IF EXISTS set_agent_preferences_updated_at ON agent_preferences;

CREATE TRIGGER set_agent_preferences_updated_at
    BEFORE UPDATE ON agent_preferences
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE weekly_plans
ALTER COLUMN created_at SET DEFAULT NOW();

ALTER TABLE weekly_plans
ALTER COLUMN updated_at SET DEFAULT NOW();

UPDATE weekly_plans
SET updated_at = COALESCE(updated_at, created_at, NOW())
WHERE updated_at IS NULL;

ALTER TABLE weekly_plans
ALTER COLUMN updated_at SET NOT NULL;

DROP TRIGGER IF EXISTS set_weekly_plans_updated_at ON weekly_plans;

CREATE TRIGGER set_weekly_plans_updated_at
    BEFORE UPDATE ON weekly_plans
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE lead_activities
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;

UPDATE lead_activities
SET updated_at = COALESCE(updated_at, created_at, NOW())
WHERE updated_at IS NULL;

ALTER TABLE lead_activities
ALTER COLUMN updated_at SET DEFAULT NOW();

ALTER TABLE lead_activities
ALTER COLUMN updated_at SET NOT NULL;

DROP TRIGGER IF EXISTS set_lead_activities_updated_at ON lead_activities;

CREATE TRIGGER set_lead_activities_updated_at
    BEFORE UPDATE ON lead_activities
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
