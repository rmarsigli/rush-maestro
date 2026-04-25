-- name: GetPermissionsForUser :many
SELECT p.name
FROM permissions p
JOIN role_permissions rp ON rp.permission_id = p.id
JOIN user_tenant_roles utr ON utr.role_id = rp.role_id
WHERE utr.user_id = $1 AND utr.tenant_id = $2;

-- name: GetTenantsForUser :many
SELECT DISTINCT tenant_id FROM user_tenant_roles WHERE user_id = $1;

-- name: AssignRoleToUser :exec
INSERT INTO user_tenant_roles (user_id, tenant_id, role_id)
VALUES ($1, $2, $3)
ON CONFLICT DO NOTHING;

-- name: RemoveRoleFromUser :exec
DELETE FROM user_tenant_roles
WHERE user_id = $1 AND tenant_id = $2 AND role_id = $3;

-- name: ListRoles :many
SELECT * FROM roles
WHERE tenant_id IS NULL OR tenant_id = $1
ORDER BY name;

-- name: GetRoleByID :one
SELECT * FROM roles WHERE id = $1 LIMIT 1;

-- name: GetPermissionsForRole :many
SELECT p.name
FROM permissions p
JOIN role_permissions rp ON rp.permission_id = p.id
WHERE rp.role_id = $1;

-- name: CreateRole :exec
INSERT INTO roles (id, name, tenant_id) VALUES ($1, $2, $3);

-- name: DeleteRole :exec
DELETE FROM roles WHERE id = $1;

-- name: DeleteRolePermissions :exec
DELETE FROM role_permissions WHERE role_id = $1;

-- name: SetRolePermissions :exec
INSERT INTO role_permissions (role_id, permission_id)
SELECT $1, id FROM permissions WHERE name = ANY($2::text[]);

-- name: ListPermissions :many
SELECT * FROM permissions ORDER BY name;
