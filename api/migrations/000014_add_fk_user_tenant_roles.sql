-- +goose Up
ALTER TABLE user_tenant_roles
    ADD CONSTRAINT fk_user_tenant_roles_tenant
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;

-- +goose Down
ALTER TABLE user_tenant_roles
    DROP CONSTRAINT IF EXISTS fk_user_tenant_roles_tenant;
