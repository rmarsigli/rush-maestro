-- +goose Up
CREATE TABLE integrations (
    id                   TEXT PRIMARY KEY,
    name                 TEXT NOT NULL,
    provider             TEXT NOT NULL,
    "group"              TEXT NOT NULL DEFAULT 'other',
    oauth_client_id      TEXT,
    oauth_client_secret  TEXT,
    developer_token      TEXT,
    login_customer_id    TEXT,
    refresh_token        TEXT,
    status               TEXT NOT NULL DEFAULT 'pending'
                             CHECK (status IN ('pending', 'connected', 'error')),
    error_message        TEXT,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE integration_tenants (
    integration_id TEXT NOT NULL REFERENCES integrations(id) ON DELETE CASCADE,
    tenant_id      TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    PRIMARY KEY (integration_id, tenant_id)
);

CREATE INDEX idx_integrations_provider ON integrations (provider);

-- +goose Down
DROP TABLE IF EXISTS integration_tenants;
DROP TABLE IF EXISTS integrations;
