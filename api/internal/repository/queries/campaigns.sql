-- name: ListCampaigns :many
SELECT * FROM campaigns WHERE tenant_id = $1 ORDER BY created_at DESC;

-- name: GetCampaignBySlug :one
SELECT * FROM campaigns WHERE tenant_id = $1 AND slug = $2 LIMIT 1;

-- name: UpsertCampaign :exec
INSERT INTO campaigns (id, tenant_id, slug, data)
VALUES ($1, $2, $3, $4)
ON CONFLICT (tenant_id, slug) DO UPDATE
SET data = EXCLUDED.data, updated_at = NOW();

-- name: MarkCampaignDeployed :exec
UPDATE campaigns SET deployed_at = NOW(), updated_at = NOW() WHERE id = $1;

-- name: DeleteCampaign :exec
DELETE FROM campaigns WHERE id = $1;
