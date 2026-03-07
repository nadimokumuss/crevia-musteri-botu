-- İlçeler tablosu
CREATE TABLE districts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL UNIQUE,
    lat DOUBLE PRECISION NOT NULL,
    lng DOUBLE PRECISION NOT NULL,
    polygon JSONB, -- GeoJSON polygon
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Trigger
CREATE TRIGGER set_districts_updated_at
    BEFORE UPDATE ON districts
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- İndeksler
CREATE INDEX idx_districts_is_active ON districts(is_active);
CREATE INDEX idx_districts_name ON districts(name);

-- RLS
ALTER TABLE districts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Districts herkes okuyabilir"
    ON districts FOR SELECT
    USING (true);

CREATE POLICY "Districts sadece admin yazabilir"
    ON districts FOR ALL
    USING (
        (SELECT raw_user_meta_data->>'role' FROM auth.users WHERE id = auth.uid()) = 'ADMIN'
    );
