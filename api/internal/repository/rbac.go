package repository

import (
	"context"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/rush-maestro/rush-maestro/internal/domain"
	"github.com/rush-maestro/rush-maestro/internal/repository/db"
)

type RBACRepository struct {
	pool    *pgxpool.Pool
	queries *db.Queries
}

func NewRBACRepository(pool *pgxpool.Pool) *RBACRepository {
	return &RBACRepository{pool: pool, queries: db.New(pool)}
}

func (r *RBACRepository) GetPermissionsForUser(ctx context.Context, userID, tenantID string) ([]string, error) {
	return r.queries.GetPermissionsForUser(ctx, db.GetPermissionsForUserParams{
		UserID:   userID,
		TenantID: tenantID,
	})
}

func (r *RBACRepository) GetTenantsForUser(ctx context.Context, userID string) ([]string, error) {
	return r.queries.GetTenantsForUser(ctx, userID)
}

func (r *RBACRepository) AssignRole(ctx context.Context, userID, tenantID, roleID string) error {
	return mapError(r.queries.AssignRoleToUser(ctx, db.AssignRoleToUserParams{
		UserID:   userID,
		TenantID: tenantID,
		RoleID:   roleID,
	}))
}

func (r *RBACRepository) RemoveRole(ctx context.Context, userID, tenantID, roleID string) error {
	return mapError(r.queries.RemoveRoleFromUser(ctx, db.RemoveRoleFromUserParams{
		UserID:   userID,
		TenantID: tenantID,
		RoleID:   roleID,
	}))
}

func (r *RBACRepository) ListRoles(ctx context.Context, tenantID string) ([]domain.Role, error) {
	rows, err := r.queries.ListRoles(ctx, &tenantID)
	if err != nil {
		return nil, mapError(err)
	}
	roles := make([]domain.Role, len(rows))
	for i, row := range rows {
		perms, _ := r.queries.GetPermissionsForRole(ctx, row.ID)
		roles[i] = mapRole(row, perms)
	}
	return roles, nil
}

func (r *RBACRepository) GetRoleByID(ctx context.Context, id string) (*domain.Role, error) {
	row, err := r.queries.GetRoleByID(ctx, id)
	if err != nil {
		return nil, mapError(err)
	}
	perms, _ := r.queries.GetPermissionsForRole(ctx, row.ID)
	role := mapRole(row, perms)
	return &role, nil
}

func (r *RBACRepository) CreateRole(ctx context.Context, role *domain.Role) error {
	return mapError(r.queries.CreateRole(ctx, db.CreateRoleParams{
		ID:       role.ID,
		Name:     role.Name,
		TenantID: role.TenantID,
	}))
}

func (r *RBACRepository) DeleteRole(ctx context.Context, id string) error {
	return mapError(r.queries.DeleteRole(ctx, id))
}

func (r *RBACRepository) SetRolePermissions(ctx context.Context, roleID string, permNames []string) error {
	if err := r.queries.DeleteRolePermissions(ctx, roleID); err != nil {
		return mapError(err)
	}
	if len(permNames) == 0 {
		return nil
	}
	return mapError(r.queries.SetRolePermissions(ctx, db.SetRolePermissionsParams{
		RoleID:  roleID,
		Column2: permNames,
	}))
}

func (r *RBACRepository) ListPermissions(ctx context.Context) ([]domain.Permission, error) {
	rows, err := r.queries.ListPermissions(ctx)
	if err != nil {
		return nil, mapError(err)
	}
	perms := make([]domain.Permission, len(rows))
	for i, row := range rows {
		perms[i] = domain.Permission{ID: row.ID, Name: row.Name}
	}
	return perms, nil
}

func mapRole(row db.Role, perms []string) domain.Role {
	return domain.Role{
		ID:          row.ID,
		Name:        row.Name,
		TenantID:    row.TenantID,
		Permissions: perms,
	}
}
