-- +goose Up
CREATE TABLE alert_events (
    id            TEXT PRIMARY KEY,
    tenant_id     TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    level         TEXT NOT NULL CHECK (level IN ('WARN', 'CRITICAL')),
    type          TEXT NOT NULL,
    campaign_id   TEXT,
    campaign_name TEXT,
    message       TEXT NOT NULL,
    details       JSONB,
    resolved_at   TIMESTAMPTZ,
    ignored_at    TIMESTAMPTZ,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_alert_events_tenant ON alert_events (tenant_id, created_at DESC);
CREATE INDEX idx_alert_events_open   ON alert_events (tenant_id)
    WHERE resolved_at IS NULL AND ignored_at IS NULL;

-- +goose Down
DROP TABLE IF EXISTS alert_events;
