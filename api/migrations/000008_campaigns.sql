-- +goose Up
CREATE TABLE campaigns (
    id          TEXT PRIMARY KEY,
    tenant_id   TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    slug        TEXT NOT NULL,
    data        JSONB NOT NULL DEFAULT '{}',
    deployed_at TIMESTAMPTZ,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (tenant_id, slug)
);

CREATE INDEX idx_campaigns_tenant_id ON campaigns (tenant_id);

-- +goose Down
DROP TABLE IF EXISTS campaigns;
