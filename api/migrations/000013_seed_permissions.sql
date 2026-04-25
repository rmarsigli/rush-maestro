-- +goose Up

INSERT INTO permissions (id, name) VALUES
    ('perm_user_view_any',       'view-any:user'),
    ('perm_user_view',           'view:user'),
    ('perm_user_create',         'create:user'),
    ('perm_user_update',         'update:user'),
    ('perm_user_delete',         'delete:user'),
    ('perm_role_view_any',       'view-any:role'),
    ('perm_role_view',           'view:role'),
    ('perm_role_create',         'create:role'),
    ('perm_role_update',         'update:role'),
    ('perm_role_delete',         'delete:role'),
    ('perm_tenant_view_any',     'view-any:tenant'),
    ('perm_tenant_view',         'view:tenant'),
    ('perm_tenant_create',       'create:tenant'),
    ('perm_tenant_update',       'update:tenant'),
    ('perm_tenant_delete',       'delete:tenant'),
    ('perm_post_view_any',       'view-any:post'),
    ('perm_post_view',           'view:post'),
    ('perm_post_create',         'create:post'),
    ('perm_post_review',         'review:post'),
    ('perm_post_approve',        'approve:post'),
    ('perm_post_schedule',       'schedule:post'),
    ('perm_post_publish',        'publish:post'),
    ('perm_post_delete',         'delete:post'),
    ('perm_report_view',         'view:report'),
    ('perm_report_create',       'create:report'),
    ('perm_campaign_view',       'view:campaign'),
    ('perm_campaign_manage',     'manage:campaign'),
    ('perm_integration_manage',  'manage:integrations'),
    ('perm_automation_manage',   'manage:automations'),
    ('perm_analytics_view',      'view:analytics')
ON CONFLICT (name) DO NOTHING;

INSERT INTO roles (id, name, tenant_id) VALUES ('role_owner', 'owner', NULL)
ON CONFLICT DO NOTHING;
INSERT INTO role_permissions (role_id, permission_id)
SELECT 'role_owner', id FROM permissions
ON CONFLICT DO NOTHING;

INSERT INTO roles (id, name, tenant_id) VALUES ('role_manager', 'manager', NULL)
ON CONFLICT DO NOTHING;
INSERT INTO role_permissions (role_id, permission_id)
SELECT 'role_manager', id FROM permissions
WHERE name NOT IN (
    'create:user', 'update:user', 'delete:user',
    'create:role', 'update:role', 'delete:role',
    'create:tenant', 'update:tenant', 'delete:tenant',
    'manage:integrations'
)
ON CONFLICT DO NOTHING;

INSERT INTO roles (id, name, tenant_id) VALUES ('role_content_creator', 'content_creator', NULL)
ON CONFLICT DO NOTHING;
INSERT INTO role_permissions (role_id, permission_id)
SELECT 'role_content_creator', id FROM permissions
WHERE name IN ('view-any:post', 'view:post', 'create:post', 'view:report', 'view:analytics')
ON CONFLICT DO NOTHING;

INSERT INTO roles (id, name, tenant_id) VALUES ('role_content_approver', 'content_approver', NULL)
ON CONFLICT DO NOTHING;
INSERT INTO role_permissions (role_id, permission_id)
SELECT 'role_content_approver', id FROM permissions
WHERE name IN ('view-any:post', 'view:post', 'review:post', 'approve:post', 'view:report', 'view:analytics')
ON CONFLICT DO NOTHING;

INSERT INTO roles (id, name, tenant_id) VALUES ('role_scheduler', 'scheduler', NULL)
ON CONFLICT DO NOTHING;
INSERT INTO role_permissions (role_id, permission_id)
SELECT 'role_scheduler', id FROM permissions
WHERE name IN ('view-any:post', 'view:post', 'schedule:post', 'publish:post', 'view:report')
ON CONFLICT DO NOTHING;

INSERT INTO roles (id, name, tenant_id) VALUES ('role_client_viewer', 'client_viewer', NULL)
ON CONFLICT DO NOTHING;
INSERT INTO role_permissions (role_id, permission_id)
SELECT 'role_client_viewer', id FROM permissions
WHERE name IN ('view:post', 'approve:post', 'view:report', 'view:analytics')
ON CONFLICT DO NOTHING;

-- +goose Down
DELETE FROM role_permissions WHERE role_id IN (
    'role_owner', 'role_manager', 'role_content_creator',
    'role_content_approver', 'role_scheduler', 'role_client_viewer'
);
DELETE FROM roles WHERE id IN (
    'role_owner', 'role_manager', 'role_content_creator',
    'role_content_approver', 'role_scheduler', 'role_client_viewer'
);
DELETE FROM permissions;
