-- +goose Up
CREATE TABLE posts (
    id             TEXT PRIMARY KEY,
    tenant_id      TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    status         TEXT NOT NULL DEFAULT 'draft'
                       CHECK (status IN ('draft', 'approved', 'scheduled', 'published')),
    title          TEXT,
    content        TEXT NOT NULL DEFAULT '',
    hashtags       JSONB NOT NULL DEFAULT '[]',
    media_type     TEXT,
    workflow       JSONB,
    media_path     TEXT,
    platforms      JSONB NOT NULL DEFAULT '[]',
    scheduled_date TEXT,
    scheduled_time TEXT,
    published_at   TIMESTAMPTZ,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_posts_tenant_id ON posts (tenant_id);
CREATE INDEX idx_posts_status    ON posts (status);
CREATE INDEX idx_posts_scheduled ON posts (tenant_id, scheduled_date)
    WHERE status = 'scheduled';

-- +goose Down
DROP TABLE IF EXISTS posts;
