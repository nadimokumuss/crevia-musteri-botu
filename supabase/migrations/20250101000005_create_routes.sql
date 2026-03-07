-- Günlük saha rotaları tablosu
CREATE TABLE routes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    route_date DATE NOT NULL,
    stops JSONB NOT NULL DEFAULT '[]'::jsonb,
    -- stops format: [{ "lead_id": "uuid", "order": 1, "lat": 41.0, "lng": 29.0, "status": "PENDING" }]
    total_distance_km DOUBLE PRECISION DEFAULT 0,
    estimated_duration_min INTEGER DEFAULT 0,
    polyline TEXT, -- encoded polyline
    is_optimized BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT unique_agent_route_date UNIQUE (agent_id, route_date)
);

-- Trigger
CREATE TRIGGER set_routes_updated_at
    BEFORE UPDATE ON routes
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- İndeksler
CREATE INDEX idx_routes_agent_id ON routes(agent_id);
CREATE INDEX idx_routes_route_date ON routes(route_date);
CREATE INDEX idx_routes_agent_date ON routes(agent_id, route_date);

-- RLS
ALTER TABLE routes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Routes admin herşeyi görebilir"
    ON routes FOR SELECT
    USING (
        (SELECT raw_user_meta_data->>'role' FROM auth.users WHERE id = auth.uid()) = 'ADMIN'
    );

CREATE POLICY "Routes ajan kendi rotalarını görebilir"
    ON routes FOR SELECT
    USING (
        agent_id IN (SELECT id FROM agents WHERE user_id = auth.uid())
    );

CREATE POLICY "Routes admin yazabilir"
    ON routes FOR ALL
    USING (
        (SELECT raw_user_meta_data->>'role' FROM auth.users WHERE id = auth.uid()) = 'ADMIN'
    );
