package api

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/rush-maestro/rush-maestro/internal/domain"
	"github.com/rush-maestro/rush-maestro/internal/middleware"
)

type AdminRolesHandler struct {
	rbacRepo interface {
		ListRoles(ctx context.Context, tenantID string) ([]domain.Role, error)
		GetRoleByID(ctx context.Context, id string) (*domain.Role, error)
		CreateRole(ctx context.Context, role *domain.Role) error
		DeleteRole(ctx context.Context, id string) error
		SetRolePermissions(ctx context.Context, roleID string, permNames []string) error
		ListPermissions(ctx context.Context) ([]domain.Permission, error)
	}
}

func NewAdminRolesHandler(rbacRepo interface {
	ListRoles(ctx context.Context, tenantID string) ([]domain.Role, error)
	GetRoleByID(ctx context.Context, id string) (*domain.Role, error)
	CreateRole(ctx context.Context, role *domain.Role) error
	DeleteRole(ctx context.Context, id string) error
	SetRolePermissions(ctx context.Context, roleID string, permNames []string) error
	ListPermissions(ctx context.Context) ([]domain.Permission, error)
}) *AdminRolesHandler {
	return &AdminRolesHandler{rbacRepo: rbacRepo}
}

type roleAdminResponse struct {
	ID          string  `json:"id"`
	Name        string  `json:"name"`
	TenantID    *string `json:"tenant_id,omitempty"`
	Permissions []string `json:"permissions,omitempty"`
}

func (h *AdminRolesHandler) List(w http.ResponseWriter, r *http.Request) {
	claims := middleware.UserClaimsFromContext(r.Context())

	roles, err := h.rbacRepo.ListRoles(r.Context(), claims.TenantID)
	if err != nil {
		InternalError(w)
		return
	}
	data := make([]roleAdminResponse, len(roles))
	for i, role := range roles {
		data[i] = toRoleAdminResponse(role)
	}
	JSON(w, http.StatusOK, map[string]any{"data": data})
}

func (h *AdminRolesHandler) Get(w http.ResponseWriter, r *http.Request) {
	role, err := h.rbacRepo.GetRoleByID(r.Context(), chi.URLParam(r, "id"))
	if err != nil {
		if errors.Is(err, domain.ErrNotFound) {
			NotFound(w)
			return
		}
		InternalError(w)
		return
	}
	JSON(w, http.StatusOK, map[string]any{"data": toRoleAdminResponse(*role)})
}

func (h *AdminRolesHandler) Create(w http.ResponseWriter, r *http.Request) {
	claims := middleware.UserClaimsFromContext(r.Context())

	var req struct {
		Name        string   `json:"name"`
		Permissions []string `json:"permissions"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Name == "" {
		UnprocessableEntity(w, "name is required")
		return
	}

	tenantID := claims.TenantID
	role := &domain.Role{
		ID:       domain.NewID(),
		Name:     req.Name,
		TenantID: &tenantID,
	}
	if err := h.rbacRepo.CreateRole(r.Context(), role); err != nil {
		if errors.Is(err, domain.ErrConflict) {
			Error(w, http.StatusConflict, "role already exists")
			return
		}
		InternalError(w)
		return
	}
	if len(req.Permissions) > 0 {
		_ = h.rbacRepo.SetRolePermissions(r.Context(), role.ID, req.Permissions)
		role.Permissions = req.Permissions
	}

	JSON(w, http.StatusCreated, map[string]any{"data": toRoleAdminResponse(*role)})
}

func (h *AdminRolesHandler) SetPermissions(w http.ResponseWriter, r *http.Request) {
	roleID := chi.URLParam(r, "id")

	var req struct {
		Permissions []string `json:"permissions"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		UnprocessableEntity(w, "invalid request body")
		return
	}

	if err := h.rbacRepo.SetRolePermissions(r.Context(), roleID, req.Permissions); err != nil {
		InternalError(w)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *AdminRolesHandler) Delete(w http.ResponseWriter, r *http.Request) {
	if err := h.rbacRepo.DeleteRole(r.Context(), chi.URLParam(r, "id")); err != nil {
		if errors.Is(err, domain.ErrNotFound) {
			NotFound(w)
			return
		}
		InternalError(w)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *AdminRolesHandler) ListPermissions(w http.ResponseWriter, r *http.Request) {
	perms, err := h.rbacRepo.ListPermissions(r.Context())
	if err != nil {
		InternalError(w)
		return
	}
	data := make([]map[string]any, len(perms))
	for i, p := range perms {
		data[i] = map[string]any{"id": p.ID, "name": p.Name}
	}
	JSON(w, http.StatusOK, map[string]any{"data": data})
}

func toRoleAdminResponse(role domain.Role) roleAdminResponse {
	return roleAdminResponse{
		ID:          role.ID,
		Name:        role.Name,
		TenantID:    role.TenantID,
		Permissions: role.Permissions,
	}
}
