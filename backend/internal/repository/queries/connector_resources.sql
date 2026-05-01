-- name: ListConnectorResources :many
SELECT * FROM connector_resources
WHERE tenant_id = $1 AND provider = $2 AND resource_type = $3
ORDER BY created_at DESC;

-- name: GetConnectorResourceByID :one
SELECT * FROM connector_resources WHERE id = $1 LIMIT 1;

-- name: UpsertConnectorResource :exec
INSERT INTO connector_resources (
    id, tenant_id, integration_id, provider, resource_type, resource_id, resource_name, metadata
) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
ON CONFLICT (tenant_id, integration_id, resource_type, resource_id)
DO UPDATE SET
    resource_name = EXCLUDED.resource_name,
    metadata = EXCLUDED.metadata,
    updated_at = NOW();

-- name: DeleteConnectorResourcesByTenantProvider :exec
DELETE FROM connector_resources WHERE tenant_id = $1 AND provider = $2;

-- name: DeleteConnectorResource :exec
DELETE FROM connector_resources WHERE id = $1;

-- name: GetConnectorResourceForTenant :one
SELECT * FROM connector_resources
WHERE tenant_id = $1 AND provider = $2 AND resource_type = $3 AND resource_id = $4
LIMIT 1;
