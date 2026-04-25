-- +goose Up
CREATE TABLE daily_metrics (
    id                      TEXT PRIMARY KEY,
    tenant_id               TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    date                    DATE NOT NULL,
    campaign_id             TEXT NOT NULL,
    campaign_name           TEXT NOT NULL,
    impressions             INTEGER NOT NULL DEFAULT 0,
    clicks                  INTEGER NOT NULL DEFAULT 0,
    cost_brl                NUMERIC(10, 2) NOT NULL DEFAULT 0,
    conversions             NUMERIC(10, 2) NOT NULL DEFAULT 0,
    cpa_brl                 NUMERIC(10, 2),
    ctr                     NUMERIC(6, 4),
    search_impression_share NUMERIC(6, 4),
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (tenant_id, date, campaign_id)
);

CREATE TABLE monthly_summary (
    id            TEXT PRIMARY KEY,
    tenant_id     TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    month         TEXT NOT NULL,
    campaign_id   TEXT NOT NULL,
    campaign_name TEXT NOT NULL,
    impressions   INTEGER NOT NULL DEFAULT 0,
    clicks        INTEGER NOT NULL DEFAULT 0,
    cost_brl      NUMERIC(10, 2) NOT NULL DEFAULT 0,
    conversions   NUMERIC(10, 2) NOT NULL DEFAULT 0,
    avg_cpa_brl   NUMERIC(10, 2),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (tenant_id, month, campaign_id)
);

CREATE INDEX idx_daily_metrics_tenant_date ON daily_metrics (tenant_id, date DESC);
CREATE INDEX idx_monthly_summary_tenant    ON monthly_summary (tenant_id, month DESC);

-- +goose Down
DROP TABLE IF EXISTS monthly_summary;
DROP TABLE IF EXISTS daily_metrics;
