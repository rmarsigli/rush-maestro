-- +goose Up
CREATE TABLE permissions (
    id   TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE
);

CREATE TABLE roles (
    id        TEXT PRIMARY KEY,
    name      TEXT NOT NULL,
    tenant_id TEXT,
    UNIQUE (name, tenant_id)
);

CREATE TABLE role_permissions (
    role_id       TEXT NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    permission_id TEXT NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
    PRIMARY KEY (role_id, permission_id)
);

-- user <-> role scoped to a tenant; a user can have multiple roles on the same tenant
CREATE TABLE user_tenant_roles (
    user_id   TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    tenant_id TEXT NOT NULL,
    role_id   TEXT NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    PRIMARY KEY (user_id, tenant_id, role_id)
);

CREATE INDEX idx_user_tenant_roles_user   ON user_tenant_roles (user_id);
CREATE INDEX idx_user_tenant_roles_tenant ON user_tenant_roles (tenant_id);

-- +goose Down
DROP TABLE IF EXISTS user_tenant_roles;
DROP TABLE IF EXISTS role_permissions;
DROP TABLE IF EXISTS roles;
DROP TABLE IF EXISTS permissions;
