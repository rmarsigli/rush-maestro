# T12 — Auth System + First-Run Onboarding

**Status:** pending  
**Phase:** 1 — Auth (blocks all protected routes)  
**Estimate:** 6–8 hours  
**Depends on:** T11 (Go Foundation)  
**Unlocks:** T14 (REST API core), T15 (Integrations Hub)

---

## Context

Implement the complete authentication system for Rush Maestro's Go API, following the exact
same patterns established in rush-cms-v2 (`/home/rafhael/www/html/rush-cms/rush-cms-v2/backend/`).

Two auth systems run in parallel:
1. **Admin auth (JWT)** — for the SvelteKit UI admin panel
2. **MCP auth (API key)** — for external agents (Claude Code, Gemini CLI) — implemented in T16

First-run onboarding follows the Coolify pattern: if no users exist in the database, `GET /health`
returns `"setup_required": true` and the UI redirects to a setup screen. After the first user
is created, the setup endpoint is permanently disabled.

---

## Files to create

```
api/
  migrations/
    000003_users.sql
    000004_rbac.sql
    000013_seed_permissions.sql
  internal/
    domain/
      user.go
      jwt.go          ← copy from rush-cms-v2, adjust module path
    repository/
      user.go
      rbac.go
      queries/
        users.sql
        rbac.sql
    api/
      auth.go
      admin_users.go
      admin_roles.go
      setup.go
    middleware/
      admin_auth.go   ← copy from rush-cms-v2, adjust module path
      context.go      ← copy from rush-cms-v2, adjust module path
```

---

## Step 1 — Migrations

### migrations/000003_users.sql

```sql
-- +goose Up
CREATE TABLE users (
    id            TEXT PRIMARY KEY,
    name          TEXT NOT NULL,
    email         TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    locale        TEXT NOT NULL DEFAULT 'en',
    timezone      TEXT NOT NULL DEFAULT 'UTC',
    is_active     BOOLEAN NOT NULL DEFAULT TRUE,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_users_email ON users (email);

-- +goose Down
DROP TABLE IF EXISTS users;
```

### migrations/000004_rbac.sql

```sql
-- +goose Up
CREATE TABLE permissions (
    id   TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE
);

CREATE TABLE roles (
    id        TEXT PRIMARY KEY,
    name      TEXT NOT NULL,
    tenant_id TEXT,                -- NULL = global template role
    UNIQUE (name, tenant_id)
);

CREATE TABLE role_permissions (
    role_id       TEXT NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    permission_id TEXT NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
    PRIMARY KEY (role_id, permission_id)
);

-- user <-> role scoped to a tenant
-- a user can have multiple roles on the same tenant
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
```

### migrations/000013_seed_permissions.sql

Seed all permissions and the default global roles. These are global templates (tenant_id IS NULL).

```sql
-- +goose Up

-- Permissions
INSERT INTO permissions (id, name) VALUES
    -- users
    ('perm_user_view_any',    'view-any:user'),
    ('perm_user_view',        'view:user'),
    ('perm_user_create',      'create:user'),
    ('perm_user_update',      'update:user'),
    ('perm_user_delete',      'delete:user'),
    -- roles
    ('perm_role_view_any',    'view-any:role'),
    ('perm_role_view',        'view:role'),
    ('perm_role_create',      'create:role'),
    ('perm_role_update',      'update:role'),
    ('perm_role_delete',      'delete:role'),
    -- tenants
    ('perm_tenant_view_any',  'view-any:tenant'),
    ('perm_tenant_view',      'view:tenant'),
    ('perm_tenant_create',    'create:tenant'),
    ('perm_tenant_update',    'update:tenant'),
    ('perm_tenant_delete',    'delete:tenant'),
    -- posts (workflow-aware)
    ('perm_post_view_any',    'view-any:post'),
    ('perm_post_view',        'view:post'),
    ('perm_post_create',      'create:post'),
    ('perm_post_review',      'review:post'),
    ('perm_post_approve',     'approve:post'),
    ('perm_post_schedule',    'schedule:post'),
    ('perm_post_publish',     'publish:post'),
    ('perm_post_delete',      'delete:post'),
    -- reports
    ('perm_report_view',      'view:report'),
    ('perm_report_create',    'create:report'),
    -- campaigns
    ('perm_campaign_view',    'view:campaign'),
    ('perm_campaign_manage',  'manage:campaign'),
    -- integrations
    ('perm_integration_manage', 'manage:integrations'),
    -- automations
    ('perm_automation_manage',  'manage:automations'),
    -- analytics
    ('perm_analytics_view',     'view:analytics')
ON CONFLICT (name) DO NOTHING;

-- Default global roles (tenant_id IS NULL = global template)

-- owner: all permissions
INSERT INTO roles (id, name, tenant_id) VALUES ('role_owner', 'owner', NULL)
ON CONFLICT DO NOTHING;
INSERT INTO role_permissions (role_id, permission_id)
SELECT 'role_owner', id FROM permissions
ON CONFLICT DO NOTHING;

-- manager: everything except user/role/tenant management and integrations
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

-- content_creator: create posts and view reports
INSERT INTO roles (id, name, tenant_id) VALUES ('role_content_creator', 'content_creator', NULL)
ON CONFLICT DO NOTHING;
INSERT INTO role_permissions (role_id, permission_id)
SELECT 'role_content_creator', id FROM permissions
WHERE name IN ('view-any:post', 'view:post', 'create:post', 'view:report', 'view:analytics')
ON CONFLICT DO NOTHING;

-- content_approver: review and approve posts
INSERT INTO roles (id, name, tenant_id) VALUES ('role_content_approver', 'content_approver', NULL)
ON CONFLICT DO NOTHING;
INSERT INTO role_permissions (role_id, permission_id)
SELECT 'role_content_approver', id FROM permissions
WHERE name IN ('view-any:post', 'view:post', 'review:post', 'approve:post', 'view:report', 'view:analytics')
ON CONFLICT DO NOTHING;

-- scheduler: schedule and publish posts
INSERT INTO roles (id, name, tenant_id) VALUES ('role_scheduler', 'scheduler', NULL)
ON CONFLICT DO NOTHING;
INSERT INTO role_permissions (role_id, permission_id)
SELECT 'role_scheduler', id FROM permissions
WHERE name IN ('view-any:post', 'view:post', 'schedule:post', 'publish:post', 'view:report')
ON CONFLICT DO NOTHING;

-- client_viewer: view reports and approve posts (for agency clients)
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
```

---

## Step 2 — Domain layer

### internal/domain/user.go

```go
package domain

import (
	"time"

	"golang.org/x/crypto/bcrypt"
)

type User struct {
	ID           string
	Name         string
	Email        string
	PasswordHash string
	Locale       string
	Timezone     string
	IsActive     bool
	CreatedAt    time.Time
	UpdatedAt    time.Time
}

type Role struct {
	ID          string
	Name        string
	TenantID    *string
	Permissions []string
}

type Permission struct {
	ID   string
	Name string
}

// UserClaims is embedded in JWT tokens and injected into request context.
type UserClaims struct {
	UserID      string
	TenantID    string   // the currently active tenant scope
	Permissions []string // permission names for this user in this tenant
}

func (u *User) SetPassword(plain string) error {
	hash, err := bcrypt.GenerateFromPassword([]byte(plain), 12)
	if err != nil {
		return err
	}
	u.PasswordHash = string(hash)
	return nil
}

func (u *User) CheckPassword(plain string) bool {
	err := bcrypt.CompareHashAndPassword([]byte(u.PasswordHash), []byte(plain))
	return err == nil
}

func (c *UserClaims) HasPermission(name string) bool {
	for _, p := range c.Permissions {
		if p == name {
			return true
		}
	}
	return false
}
```

### internal/domain/jwt.go

Copy from rush-cms-v2 and adjust the module path:

```bash
cp /home/rafhael/www/html/rush-cms/rush-cms-v2/backend/internal/domain/jwt.go \
   /home/rafhael/www/html/marketing/api/internal/domain/jwt.go
```

Then replace every occurrence of `rush-cms/rush-cms-v2` with `rush-maestro/rush-maestro` in the file.
Verify the struct names match what `user.go` above uses (`UserClaims` with fields `UserID`, `TenantID`, `Permissions`).
Adjust field names in the JWT claims struct if they differ from rush-cms-v2 (v2 uses `SiteID` — rename to `TenantID`).

The JWT service must provide:
- `IssueAccessToken(claims UserClaims) (string, error)` — 15 min TTL
- `IssueRefreshToken(userID, tenantID string) (string, error)` — 7 day TTL
- `ParseAccessToken(token string) (*UserClaims, error)`
- `ParseRefreshToken(token string) (userID, tenantID string, err error)`

---

## Step 3 — SQL Queries

### internal/repository/queries/users.sql

```sql
-- name: GetUserByEmail :one
SELECT * FROM users WHERE email = $1 LIMIT 1;

-- name: GetUserByID :one
SELECT * FROM users WHERE id = $1 LIMIT 1;

-- name: ListUsers :many
SELECT * FROM users ORDER BY created_at DESC;

-- name: CreateUser :exec
INSERT INTO users (id, name, email, password_hash, locale, timezone, is_active)
VALUES ($1, $2, $3, $4, $5, $6, $7);

-- name: UpdateUser :exec
UPDATE users
SET name = $2, email = $3, locale = $4, timezone = $5, is_active = $6, updated_at = NOW()
WHERE id = $1;

-- name: UpdateUserPassword :exec
UPDATE users SET password_hash = $2, updated_at = NOW() WHERE id = $1;

-- name: DeleteUser :exec
DELETE FROM users WHERE id = $1;

-- name: CountUsers :one
SELECT COUNT(*) FROM users;
```

### internal/repository/queries/rbac.sql

```sql
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
SELECT r.*, array_agg(p.name) FILTER (WHERE p.name IS NOT NULL) AS permissions
FROM roles r
LEFT JOIN role_permissions rp ON rp.role_id = r.id
LEFT JOIN permissions p ON p.id = rp.permission_id
WHERE r.tenant_id IS NULL OR r.tenant_id = $1
GROUP BY r.id
ORDER BY r.name;

-- name: GetRoleByID :one
SELECT * FROM roles WHERE id = $1 LIMIT 1;

-- name: CreateRole :exec
INSERT INTO roles (id, name, tenant_id) VALUES ($1, $2, $3);

-- name: DeleteRole :exec
DELETE FROM roles WHERE id = $1;

-- name: SetRolePermissions :exec
-- Call this after deleting existing role_permissions for the role
INSERT INTO role_permissions (role_id, permission_id)
SELECT $1, id FROM permissions WHERE name = ANY($2::text[]);

-- name: ListPermissions :many
SELECT * FROM permissions ORDER BY name;
```

After writing both SQL files, regenerate SQLC:
```bash
cd /home/rafhael/www/html/marketing/api
go run github.com/sqlc-dev/sqlc/cmd/sqlc@latest generate
```

---

## Step 4 — Repository layer

### internal/repository/user.go

```go
package repository

import (
	"context"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/rush-maestro/rush-maestro/internal/domain"
	"github.com/rush-maestro/rush-maestro/internal/repository/db"
)

type UserRepository struct {
	pool    *pgxpool.Pool
	queries *db.Queries
}

func NewUserRepository(pool *pgxpool.Pool) *UserRepository {
	return &UserRepository{pool: pool, queries: db.New(pool)}
}

func (r *UserRepository) GetByEmail(ctx context.Context, email string) (*domain.User, error) {
	row, err := r.queries.GetUserByEmail(ctx, email)
	if err != nil {
		return nil, mapError(err)
	}
	return mapUser(row), nil
}

func (r *UserRepository) GetByID(ctx context.Context, id string) (*domain.User, error) {
	row, err := r.queries.GetUserByID(ctx, id)
	if err != nil {
		return nil, mapError(err)
	}
	return mapUser(row), nil
}

func (r *UserRepository) Create(ctx context.Context, u *domain.User) error {
	return mapError(r.queries.CreateUser(ctx, db.CreateUserParams{
		ID:           u.ID,
		Name:         u.Name,
		Email:        u.Email,
		PasswordHash: u.PasswordHash,
		Locale:       u.Locale,
		Timezone:     u.Timezone,
		IsActive:     u.IsActive,
	}))
}

func (r *UserRepository) Count(ctx context.Context) (int64, error) {
	return r.queries.CountUsers(ctx)
}

// mapUser converts a SQLC-generated row to a domain.User.
func mapUser(row db.User) *domain.User {
	return &domain.User{
		ID:           row.ID,
		Name:         row.Name,
		Email:        row.Email,
		PasswordHash: row.PasswordHash,
		Locale:       row.Locale,
		Timezone:     row.Timezone,
		IsActive:     row.IsActive,
		CreatedAt:    row.CreatedAt.Time,
		UpdatedAt:    row.UpdatedAt.Time,
	}
}
```

### internal/repository/rbac.go

Implement `RBACRepository` with:
- `GetPermissionsForUser(ctx, userID, tenantID string) ([]string, error)`
- `GetTenantsForUser(ctx, userID string) ([]string, error)`
- `AssignRole(ctx, userID, tenantID, roleID string) error`
- `ListRoles(ctx, tenantID string) ([]domain.Role, error)`
- `ListPermissions(ctx) ([]domain.Permission, error)`
- `CreateRole(ctx, role *domain.Role) error`
- `SetRolePermissions(ctx, roleID string, permNames []string) error`

Follow the same mapping pattern as `user.go`.

### internal/repository/errors.go

Copy from rush-cms-v2 and adjust module path:
```bash
cp /home/rafhael/www/html/rush-cms/rush-cms-v2/backend/internal/repository/errors.go \
   /home/rafhael/www/html/marketing/api/internal/repository/errors.go
```
Replace module path references. This file maps `pgx` errors (e.g., `ErrNoRows`) to domain errors.

---

## Step 5 — Middleware

### internal/middleware/admin_auth.go

Copy from rush-cms-v2 and adjust:
```bash
cp /home/rafhael/www/html/rush-cms/rush-cms-v2/backend/internal/middleware/admin_auth.go \
   /home/rafhael/www/html/marketing/api/internal/middleware/admin_auth.go
```

Key functions this file must export:
- `AuthenticateAdmin(jwtSvc *domain.JWTService) func(http.Handler) http.Handler`
  — Parses the `Authorization: Bearer <token>` header, validates the JWT, injects `*domain.UserClaims` into context.
- `RequirePermission(permName string) func(http.Handler) http.Handler`
  — Reads `UserClaims` from context, returns 403 if the permission is missing.

Adjust `SiteID` → `TenantID` in the claims if the v2 copy uses different field names.

### internal/middleware/context.go

Copy from rush-cms-v2:
```bash
cp /home/rafhael/www/html/rush-cms/rush-cms-v2/backend/internal/middleware/context.go \
   /home/rafhael/www/html/marketing/api/internal/middleware/context.go
```

This file provides typed context keys and helpers:
- `UserClaimsFromContext(ctx) (*domain.UserClaims, bool)`
- `SetUserClaims(ctx, claims) context.Context`

---

## Step 6 — API handlers

### internal/api/auth.go

Implement the following endpoints:

```
POST /auth/login           — email + password → JWT pair
POST /auth/refresh         — refresh token cookie → new JWT pair
POST /auth/logout          — clear refresh cookie
GET  /auth/me              — current user + permissions + tenants (JWT required)
PUT  /auth/me              — update name, locale, timezone (JWT required)
POST /auth/change-password — current + new password (JWT required)
```

Login flow:
1. Parse `{"email": "...", "password": "..."}` from body
2. `userRepo.GetByEmail(email)` — return 401 if not found
3. `user.CheckPassword(password)` — return 401 if wrong
4. Check `user.IsActive` — return 403 if false
5. `rbacRepo.GetTenantsForUser(userID)` — get tenant list
6. Select first tenant as active scope (or return 400 if no tenants assigned)
7. `rbacRepo.GetPermissionsForUser(userID, tenantID)`
8. `jwtSvc.IssueAccessToken(claims)` + `jwtSvc.IssueRefreshToken(...)`
9. Set refresh token as `HttpOnly` cookie (secure if production)
10. Return `{"access_token": "...", "user": {...}, "tenants": [...], "active_tenant": "..."}`

Refresh flow:
1. Read refresh token from cookie
2. `jwtSvc.ParseRefreshToken(token)` — return 401 if invalid/expired
3. Reload permissions from DB (they may have changed)
4. Issue new token pair
5. Return same shape as login

### internal/api/setup.go

```go
package api

// SetupHandler handles the first-run account creation.
// The endpoint is disabled once the first user exists.

type SetupHandler struct {
	userRepo interface {
		Count(ctx context.Context) (int64, error)
		Create(ctx context.Context, u *domain.User) error
	}
	rbacRepo interface {
		AssignRole(ctx context.Context, userID, tenantID, roleID string) error
	}
}

// POST /setup
// Body: {"name": "...", "email": "...", "password": "..."}
// Returns 404 if any user already exists (setup is one-time only).
func (h *SetupHandler) Create(w http.ResponseWriter, r *http.Request) {
	count, err := h.userRepo.Count(r.Context())
	if err != nil || count > 0 {
		// Already set up — endpoint no longer exists
		http.NotFound(w, r)
		return
	}
	// parse body, validate (name required, email valid, password >= 8 chars)
	// create user with ID = domain.NewID()
	// user.SetPassword(plain)
	// userRepo.Create(user)
	// Note: first user is global owner — no tenant_id yet.
	// Tenant assignment happens when the first tenant is created in T14.
	// Return 201 with the created user (no password hash).
}
```

Update `GET /health` in `api/health.go` to call `userRepo.Count()`:

```go
type HealthHandler struct {
	userRepo interface {
		Count(ctx context.Context) (int64, error)
	}
}

func (h *HealthHandler) Handle(w http.ResponseWriter, r *http.Request) {
	count, _ := h.userRepo.Count(r.Context())
	json.NewEncoder(w).Encode(map[string]any{
		"status":         "ok",
		"setup_required": count == 0,
	})
}
```

### internal/api/admin_users.go

```
GET    /admin/users          — list all users (requires view-any:user)
POST   /admin/users          — create user (requires create:user)
GET    /admin/users/{id}     — get user (requires view:user)
PUT    /admin/users/{id}     — update user (requires update:user)
DELETE /admin/users/{id}     — delete user (requires delete:user)
PUT    /admin/users/{id}/role — assign role to user on a tenant (requires update:user)
```

### internal/api/admin_roles.go

```
GET    /admin/roles           — list roles (requires view-any:role)
POST   /admin/roles           — create role (requires create:role)
GET    /admin/roles/{id}      — get role + permissions (requires view:role)
PUT    /admin/roles/{id}/permissions — replace permissions on role (requires update:role)
DELETE /admin/roles/{id}      — delete role (requires delete:role)
GET    /admin/permissions     — list all permissions (requires view:role)
```

---

## Step 7 — Wire everything in main.go

Update `cmd/server/main.go` to:

1. Initialize repositories:
```go
userRepo := repository.NewUserRepository(pool)
rbacRepo := repository.NewRBACRepository(pool)
```

2. Initialize JWT service:
```go
jwtSvc := domain.NewJWTService(cfg.JWTSecret)
```

3. Register health handler with real userRepo:
```go
healthHandler := &api.HealthHandler{userRepo: userRepo}
r.Get("/health", healthHandler.Handle)
```

4. Register setup endpoint (no auth required):
```go
r.Post("/setup", (&api.SetupHandler{userRepo: userRepo, rbacRepo: rbacRepo}).Create)
```

5. Register auth routes:
```go
authHandler := api.NewAuthHandler(userRepo, rbacRepo, jwtSvc, cfg)
r.Route("/auth", func(r chi.Router) {
    r.Use(middleware.AdminCORS(cfg.AdminCORSOrigins))
    r.Post("/login", authHandler.Login)
    r.Post("/refresh", authHandler.Refresh)
    r.Post("/logout", authHandler.Logout)
    r.Group(func(r chi.Router) {
        r.Use(middleware.AuthenticateAdmin(jwtSvc))
        r.Get("/me", authHandler.Me)
        r.Put("/me", authHandler.UpdateMe)
        r.Post("/change-password", authHandler.ChangePassword)
    })
})
```

6. Register admin routes with permission middleware:
```go
r.Route("/admin", func(r chi.Router) {
    r.Use(middleware.AdminCORS(cfg.AdminCORSOrigins))
    r.Use(middleware.AuthenticateAdmin(jwtSvc))

    usersHandler := api.NewAdminUsersHandler(userRepo, rbacRepo)
    r.Get("/users", middleware.RequirePermission("view-any:user")(usersHandler.List))
    r.Post("/users", middleware.RequirePermission("create:user")(usersHandler.Create))
    // ... etc

    rolesHandler := api.NewAdminRolesHandler(rbacRepo)
    r.Get("/roles", middleware.RequirePermission("view-any:role")(rolesHandler.List))
    // ... etc
})
```

---

## Step 8 — Run migrations and verify

```bash
cd /home/rafhael/www/html/marketing/api

# Apply new migrations
go run ./cmd/migrate up

# Verify
go run ./cmd/migrate status
# Expected: 000001, 000003, 000004, 000013 all Applied
```

---

## Step 9 — Manual verification

```bash
# Start server
go run ./cmd/server &

# 1. Health before setup
curl -s http://localhost:8080/health
# Expected: {"setup_required":true,"status":"ok"}

# 2. Create first user
curl -s -X POST http://localhost:8080/setup \
  -H "Content-Type: application/json" \
  -d '{"name":"Admin","email":"admin@example.com","password":"supersecret123"}'
# Expected: 201 with user object

# 3. Health after setup
curl -s http://localhost:8080/health
# Expected: {"setup_required":false,"status":"ok"}

# 4. Setup disabled after first use
curl -s -X POST http://localhost:8080/setup \
  -H "Content-Type: application/json" \
  -d '{"name":"Hacker","email":"hacker@example.com","password":"password123"}'
# Expected: 404

# 5. Login (will fail until a tenant is assigned — that happens in T14)
# For now verify the endpoint exists and returns structured errors
curl -s -X POST http://localhost:8080/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@example.com","password":"supersecret123"}'

kill %1
```

---

## Step 10 — i18n strings

Add to `api/internal/i18n/locales/en.json`:
```json
{
  "error.invalid_credentials": "Invalid email or password.",
  "error.account_inactive": "Your account has been deactivated.",
  "error.no_tenant_assigned": "Your account is not assigned to any tenant. Contact an administrator.",
  "error.setup_already_done": "Setup has already been completed.",
  "error.password_too_short": "Password must be at least 8 characters.",
  "error.current_password_wrong": "Current password is incorrect.",
  "setup.success": "Account created. You can now log in.",
  "auth.logout_success": "Logged out successfully."
}
```

Add to `api/internal/i18n/locales/pt_BR.json`:
```json
{
  "error.invalid_credentials": "E-mail ou senha inválidos.",
  "error.account_inactive": "Sua conta foi desativada.",
  "error.no_tenant_assigned": "Sua conta não está associada a nenhum cliente. Contate o administrador.",
  "error.setup_already_done": "A configuração inicial já foi concluída.",
  "error.password_too_short": "A senha deve ter no mínimo 8 caracteres.",
  "error.current_password_wrong": "A senha atual está incorreta.",
  "setup.success": "Conta criada. Você já pode fazer login.",
  "auth.logout_success": "Logout realizado com sucesso."
}
```

The i18n loader itself can be a simple placeholder for now — the important part is that strings are
not hardcoded in handler responses. Even a `map[string]string` loaded from JSON at startup is enough
for this task.

---

## What NOT to do in this task

- Do not implement tenant creation (T14)
- Do not implement MCP API key auth (T16)
- Do not implement the SvelteKit login UI (separate task)
- Do not add audit logging yet (T20)
- Do not use the `tenant_id` foreign key constraint in `user_tenant_roles` yet —
  the tenants table doesn't exist until T13. Add the FK in a later migration once T13 runs.

---

## Completion criteria

- [ ] `go build ./...` passes with zero errors
- [ ] `go vet ./...` passes
- [ ] `GET /health` returns `"setup_required": true` on fresh DB
- [ ] `POST /setup` creates first user and returns 201
- [ ] `GET /health` returns `"setup_required": false` after setup
- [ ] Second `POST /setup` call returns 404
- [ ] `POST /auth/login` with correct credentials returns an access token
- [ ] `POST /auth/login` with wrong password returns 401
- [ ] `GET /auth/me` with valid token returns user data
- [ ] `GET /auth/me` with no token returns 401
- [ ] `GET /admin/users` without `view-any:user` permission returns 403
- [ ] `go run ./cmd/migrate status` shows 4 migrations applied

---

## References

- rush-cms-v2 auth handler: `/home/rafhael/www/html/rush-cms/rush-cms-v2/backend/internal/api/auth.go`
- rush-cms-v2 JWT domain: `/home/rafhael/www/html/rush-cms/rush-cms-v2/backend/internal/domain/jwt.go`
- rush-cms-v2 RBAC migration: `/home/rafhael/www/html/rush-cms/rush-cms-v2/backend/migrations/000017_create_rbac.sql`
- rush-cms-v2 permissions seed: `/home/rafhael/www/html/rush-cms/rush-cms-v2/backend/migrations/000020_seed_permissions_and_roles.sql`
- rush-cms-v2 admin auth middleware: `/home/rafhael/www/html/rush-cms/rush-cms-v2/backend/internal/middleware/admin_auth.go`
- Roadmap: `/home/rafhael/www/html/marketing/.project/tasks/README.md`
- Previous task: T11 — Go Foundation
- Next task: T13 — Data Migration SQLite → PostgreSQL
