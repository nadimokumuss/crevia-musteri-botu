-- Lead durumları
CREATE TYPE lead_status AS ENUM ('NEW', 'CONTACTED', 'QUALIFIED', 'PROPOSAL', 'WON', 'LOST', 'SKIP');
CREATE TYPE lead_recommendation AS ENUM ('HIGH_PRIORITY', 'MEDIUM', 'LOW_PRIORITY', 'SKIP');

-- Potansiyel müşteriler tablosu
CREATE TABLE leads (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    district_id UUID REFERENCES districts(id) ON DELETE SET NULL,

    -- İşletme bilgileri
    business_name TEXT NOT NULL,
    category TEXT,
    address TEXT,
    phone TEXT,
    website TEXT,
    lat DOUBLE PRECISION,
    lng DOUBLE PRECISION,

    -- Google verisi
    google_place_id TEXT UNIQUE,
    google_rating DOUBLE PRECISION,
    google_review_count INTEGER,
    google_photo_count INTEGER,
    google_is_claimed BOOLEAN,
    google_last_updated TIMESTAMPTZ,

    -- Instagram verisi
    ig_username TEXT,
    ig_follower_count INTEGER,
    ig_post_count INTEGER,
    ig_avg_likes DOUBLE PRECISION,
    ig_last_post_date TIMESTAMPTZ,
    ig_has_highlights BOOLEAN,
    ig_bio_contains_agency BOOLEAN,

    -- Puanlama
    need_score INTEGER DEFAULT 0 CHECK (need_score >= 0 AND need_score <= 100),
    google_sub_score INTEGER DEFAULT 0 CHECK (google_sub_score >= 0 AND google_sub_score <= 50),
    instagram_sub_score INTEGER DEFAULT 0 CHECK (instagram_sub_score >= 0 AND instagram_sub_score <= 50),
    recommendation lead_recommendation DEFAULT 'SKIP',

    -- Durum
    status lead_status NOT NULL DEFAULT 'NEW',
    notes TEXT,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Trigger
CREATE TRIGGER set_leads_updated_at
    BEFORE UPDATE ON leads
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- İndeksler
CREATE INDEX idx_leads_district_id ON leads(district_id);
CREATE INDEX idx_leads_status ON leads(status);
CREATE INDEX idx_leads_need_score ON leads(need_score DESC);
CREATE INDEX idx_leads_recommendation ON leads(recommendation);
CREATE INDEX idx_leads_lat_lng ON leads(lat, lng);
CREATE INDEX idx_leads_google_place_id ON leads(google_place_id);
CREATE INDEX idx_leads_business_name ON leads(business_name);

-- RLS
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Leads herkes okuyabilir"
    ON leads FOR SELECT
    USING (true);

CREATE POLICY "Leads admin ve ajan yazabilir"
    ON leads FOR INSERT
    WITH CHECK (
        (SELECT raw_user_meta_data->>'role' FROM auth.users WHERE id = auth.uid()) IN ('ADMIN', 'FIELD_AGENT', 'TELESALES_AGENT')
    );

CREATE POLICY "Leads admin ve ajan güncelleyebilir"
    ON leads FOR UPDATE
    USING (
        (SELECT raw_user_meta_data->>'role' FROM auth.users WHERE id = auth.uid()) IN ('ADMIN', 'FIELD_AGENT', 'TELESALES_AGENT')
    );
