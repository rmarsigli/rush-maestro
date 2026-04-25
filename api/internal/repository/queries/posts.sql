-- name: ListPosts :many
SELECT * FROM posts WHERE tenant_id = $1
ORDER BY created_at DESC;

-- name: ListPostsByStatus :many
SELECT * FROM posts WHERE tenant_id = $1 AND status = $2
ORDER BY created_at DESC;

-- name: GetPostByID :one
SELECT * FROM posts WHERE id = $1 LIMIT 1;

-- name: CreatePost :exec
INSERT INTO posts (id, tenant_id, status, title, content, hashtags, media_type,
    workflow, media_path, platforms, scheduled_date, scheduled_time)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12);

-- name: UpdatePostStatus :exec
UPDATE posts SET status = $2, published_at = $3, updated_at = NOW() WHERE id = $1;

-- name: UpdatePost :exec
UPDATE posts
SET title = $2, content = $3, hashtags = $4, media_type = $5,
    platforms = $6, scheduled_date = $7, scheduled_time = $8,
    workflow = $9, updated_at = NOW()
WHERE id = $1;

-- name: DeletePost :exec
DELETE FROM posts WHERE id = $1;

-- name: ListScheduledPosts :many
SELECT * FROM posts
WHERE tenant_id = $1 AND status = 'scheduled'
  AND scheduled_date IS NOT NULL
ORDER BY scheduled_date, scheduled_time;
