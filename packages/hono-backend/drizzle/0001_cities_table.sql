-- Create cities table for multi-city support
CREATE TABLE IF NOT EXISTS cities (
    id SERIAL PRIMARY KEY,
    code TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    country TEXT NOT NULL,
    language TEXT NOT NULL DEFAULT 'de',
    timezone TEXT NOT NULL,
    transit_provider TEXT NOT NULL,
    osm_line_relations JSONB NOT NULL,
    bounds JSONB NOT NULL,
    telegram_group_url TEXT,
    reddit_url TEXT,
    whatsapp_group_url TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    enable_reports BOOLEAN NOT NULL DEFAULT true,
    enable_nlp BOOLEAN NOT NULL DEFAULT true,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Create indexes for efficient queries
CREATE INDEX IF NOT EXISTS cities_code_idx ON cities(code);
CREATE INDEX IF NOT EXISTS cities_country_idx ON cities(country);
CREATE INDEX IF NOT EXISTS cities_active_idx ON cities(is_active);

-- Add comment describing the table
COMMENT ON TABLE cities IS 'Stores configuration for each supported city';
COMMENT ON COLUMN cities.code IS 'Unique identifier for city (e.g., berlin, munich)';
COMMENT ON COLUMN cities.osm_line_relations IS 'OpenStreetMap line relation IDs {"U1": 2669205, ...}';
COMMENT ON COLUMN cities.bounds IS '{"north": 52.67, "south": 52.34, "east": 13.76, "west": 13.04}';
