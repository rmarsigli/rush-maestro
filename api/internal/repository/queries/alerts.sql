-- name: ListOpenAlerts :many
SELECT * FROM alert_events
WHERE tenant_id = $1
  AND resolved_at IS NULL AND ignored_at IS NULL
ORDER BY
    CASE level WHEN 'CRITICAL' THEN 0 ELSE 1 END,
    created_at DESC;

-- name: CountOpenAlerts :one
SELECT COUNT(*) FROM alert_events
WHERE tenant_id = $1
  AND resolved_at IS NULL AND ignored_at IS NULL;

-- name: CreateAlert :exec
INSERT INTO alert_events (id, tenant_id, level, type, campaign_id, campaign_name, message, details)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8);

-- name: ResolveAlert :exec
UPDATE alert_events SET resolved_at = NOW() WHERE id = $1;

-- name: IgnoreAlert :exec
UPDATE alert_events SET ignored_at = NOW() WHERE id = $1;

-- name: ListAlertHistory :many
SELECT * FROM alert_events
WHERE tenant_id = $1
ORDER BY created_at DESC
LIMIT $2;
