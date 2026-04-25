-- +goose Up
CREATE TABLE reports (
    id         TEXT PRIMARY KEY,
    tenant_id  TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    slug       TEXT NOT NULL,
    type       TEXT NOT NULL DEFAULT 'report'
                   CHECK (type IN ('audit', 'search', 'weekly', 'monthly', 'alert', 'report')),
    title      TEXT,
    content    TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (tenant_id, slug)
);

CREATE INDEX idx_reports_tenant_id ON reports (tenant_id);

-- +goose Down
DROP TABLE IF EXISTS reports;
