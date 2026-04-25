-- name: UpsertDailyMetrics :exec
INSERT INTO daily_metrics (id, tenant_id, date, campaign_id, campaign_name,
    impressions, clicks, cost_brl, conversions, cpa_brl, ctr, search_impression_share)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
ON CONFLICT (tenant_id, date, campaign_id) DO UPDATE
SET impressions = EXCLUDED.impressions,
    clicks = EXCLUDED.clicks,
    cost_brl = EXCLUDED.cost_brl,
    conversions = EXCLUDED.conversions,
    cpa_brl = EXCLUDED.cpa_brl,
    ctr = EXCLUDED.ctr,
    search_impression_share = EXCLUDED.search_impression_share;

-- name: GetMetricsHistory :many
SELECT * FROM daily_metrics
WHERE tenant_id = $1 AND date >= $2::date
ORDER BY date DESC;

-- name: UpsertMonthlySummary :exec
INSERT INTO monthly_summary (id, tenant_id, month, campaign_id, campaign_name,
    impressions, clicks, cost_brl, conversions, avg_cpa_brl)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
ON CONFLICT (tenant_id, month, campaign_id) DO UPDATE
SET impressions = EXCLUDED.impressions,
    clicks = EXCLUDED.clicks,
    cost_brl = EXCLUDED.cost_brl,
    conversions = EXCLUDED.conversions,
    avg_cpa_brl = EXCLUDED.avg_cpa_brl;

-- name: GetMonthlySummary :many
SELECT * FROM monthly_summary
WHERE tenant_id = $1
ORDER BY month DESC
LIMIT $2;
