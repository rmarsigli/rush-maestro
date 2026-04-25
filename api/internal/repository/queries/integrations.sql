-- name: ListIntegrations :many
SELECT * FROM integrations ORDER BY name;

-- name: GetIntegrationByID :one
SELECT * FROM integrations WHERE id = $1 LIMIT 1;

-- name: GetIntegrationForTenant :one
SELECT i.* FROM integrations i
JOIN integration_tenants it ON it.integration_id = i.id
WHERE it.tenant_id = $1 AND i.provider = $2
  AND i.status = 'connected'
LIMIT 1;

-- name: CreateIntegration :exec
INSERT INTO integrations (id, name, provider, "group", oauth_client_id, oauth_client_secret,
    developer_token, login_customer_id, status)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9);

-- name: UpdateIntegration :exec
UPDATE integrations
SET name = $2, oauth_client_id = $3, oauth_client_secret = $4,
    developer_token = $5, login_customer_id = $6, refresh_token = $7,
    status = $8, error_message = $9, updated_at = NOW()
WHERE id = $1;

-- name: DeleteIntegration :exec
DELETE FROM integrations WHERE id = $1;

-- name: GetTenantsForIntegration :many
SELECT tenant_id FROM integration_tenants WHERE integration_id = $1;

-- name: DeleteIntegrationTenants :exec
DELETE FROM integration_tenants WHERE integration_id = $1;

-- name: InsertIntegrationTenant :exec
INSERT INTO integration_tenants (integration_id, tenant_id)
VALUES ($1, $2) ON CONFLICT DO NOTHING;
