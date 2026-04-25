-- +goose Up
CREATE TABLE agent_runs (
    id          TEXT PRIMARY KEY,
    tenant_id   TEXT REFERENCES tenants(id) ON DELETE SET NULL,
    agent       TEXT NOT NULL,
    status      TEXT NOT NULL CHECK (status IN ('running', 'success', 'error')),
    started_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    finished_at TIMESTAMPTZ,
    summary     TEXT,
    error       TEXT
);

CREATE INDEX idx_agent_runs_tenant ON agent_runs (tenant_id, started_at DESC);

-- +goose Down
DROP TABLE IF EXISTS agent_runs;
