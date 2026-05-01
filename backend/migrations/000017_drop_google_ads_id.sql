-- +goose Up
ALTER TABLE tenants DROP COLUMN IF EXISTS google_ads_id;

-- +goose Down
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS google_ads_id TEXT;
