-- name: ListReports :many
SELECT id, tenant_id, slug, type, title, created_at
FROM reports WHERE tenant_id = $1
ORDER BY created_at DESC;

-- name: GetReportBySlug :one
SELECT * FROM reports WHERE tenant_id = $1 AND slug = $2 LIMIT 1;

-- name: GetReportByID :one
SELECT * FROM reports WHERE id = $1 LIMIT 1;

-- name: CreateReport :exec
INSERT INTO reports (id, tenant_id, slug, type, title, content)
VALUES ($1, $2, $3, $4, $5, $6);

-- name: DeleteReport :exec
DELETE FROM reports WHERE id = $1;
