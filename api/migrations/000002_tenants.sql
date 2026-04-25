-- +goose Up
CREATE TABLE tenants (
    id              TEXT PRIMARY KEY,
    name            TEXT NOT NULL,
    language        TEXT NOT NULL DEFAULT 'pt_BR',
    niche           TEXT,
    location        TEXT,
    primary_persona TEXT,
    tone            TEXT,
    instructions    TEXT,
    hashtags        JSONB NOT NULL DEFAULT '[]',
    google_ads_id   TEXT,
    ads_monitoring  JSONB,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- +goose Down
DROP TABLE IF EXISTS tenants;
