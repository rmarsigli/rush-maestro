-- +goose Up
CREATE TABLE connector_resources (
    id             TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    tenant_id      TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    integration_id TEXT NOT NULL REFERENCES integrations(id) ON DELETE CASCADE,
    provider       TEXT NOT NULL,
    resource_type  TEXT NOT NULL,
    resource_id    TEXT NOT NULL,
    resource_name  TEXT,
    metadata       JSONB NOT NULL DEFAULT '{}',
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_connector_resources_unique ON connector_resources (tenant_id, integration_id, resource_type, resource_id);
CREATE INDEX idx_connector_resources_lookup ON connector_resources (tenant_id, provider, resource_type);
CREATE INDEX idx_connector_resources_integration ON connector_resources (integration_id);

-- Migrate existing meta_accounts data into connector_resources
INSERT INTO connector_resources (
    id, tenant_id, integration_id, provider, resource_type, resource_id, resource_name, metadata, created_at, updated_at
)
SELECT
    id,
    tenant_id,
    integration_id,
    'meta' AS provider,
    'page' AS resource_type,
    page_id AS resource_id,
    page_name AS resource_name,
    jsonb_build_object('ig_user_id', ig_user_id, 'ig_username', ig_username) AS metadata,
    created_at,
    updated_at
FROM meta_accounts;

DROP TABLE IF EXISTS meta_accounts;

-- +goose Down
DROP TABLE IF EXISTS connector_resources;
