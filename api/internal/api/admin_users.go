package api

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/rush-maestro/rush-maestro/internal/domain"
	"github.com/rush-maestro/rush-maestro/internal/middleware"
)

type AdminUsersHandler struct {
	userRepo interface {
		List(ctx context.Context) ([]*domain.User, error)
		GetByID(ctx context.Context, id string) (*domain.User, error)
		Create(ctx context.Context, u *domain.User) error
		Update(ctx context.Context, u *domain.User) error
		Delete(ctx context.Context, id string) error
	}
	rbacRepo interface {
		AssignRole(ctx context.Context, userID, tenantID, roleID string) error
		RemoveRole(ctx context.Context, userID, tenantID, roleID string) error
	}
}

func NewAdminUsersHandler(
	userRepo interface {
		List(ctx context.Context) ([]*domain.User, error)
		GetByID(ctx context.Context, id string) (*domain.User, error)
		Create(ctx context.Context, u *domain.User) error
		Update(ctx context.Context, u *domain.User) error
		Delete(ctx context.Context, id string) error
	},
	rbacRepo interface {
		AssignRole(ctx context.Context, userID, tenantID, roleID string) error
		RemoveRole(ctx context.Context, userID, tenantID, roleID string) error
	},
) *AdminUsersHandler {
	return &AdminUsersHandler{userRepo: userRepo, rbacRepo: rbacRepo}
}

type userAdminResponse struct {
	ID        string    `json:"id"`
	Name      string    `json:"name"`
	Email     string    `json:"email"`
	Locale    string    `json:"locale"`
	Timezone  string    `json:"timezone"`
	IsActive  bool      `json:"is_active"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

func (h *AdminUsersHandler) List(w http.ResponseWriter, r *http.Request) {
	users, err := h.userRepo.List(r.Context())
	if err != nil {
		InternalError(w)
		return
	}
	data := make([]userAdminResponse, len(users))
	for i, u := range users {
		data[i] = toUserAdminResponse(u)
	}
	JSON(w, http.StatusOK, map[string]any{"data": data})
}

func (h *AdminUsersHandler) Get(w http.ResponseWriter, r *http.Request) {
	u, err := h.userRepo.GetByID(r.Context(), chi.URLParam(r, "id"))
	if err != nil {
		if errors.Is(err, domain.ErrNotFound) {
			NotFound(w)
			return
		}
		InternalError(w)
		return
	}
	JSON(w, http.StatusOK, map[string]any{"data": toUserAdminResponse(u)})
}

func (h *AdminUsersHandler) Create(w http.ResponseWriter, r *http.Request) {
	claims := middleware.UserClaimsFromContext(r.Context())

	var req struct {
		Name     string `json:"name"`
		Email    string `json:"email"`
		Password string `json:"password"`
		RoleID   string `json:"role_id"`
		TenantID string `json:"tenant_id"`
		Locale   string `json:"locale"`
		Timezone string `json:"timezone"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		UnprocessableEntity(w, "invalid request body")
		return
	}
	if req.Name == "" || req.Email == "" || req.Password == "" {
		UnprocessableEntity(w, "name, email and password are required")
		return
	}
	if len(req.Password) < 8 {
		UnprocessableEntity(w, "password must be at least 8 characters")
		return
	}

	u := &domain.User{
		ID:       domain.NewID(),
		Name:     req.Name,
		Email:    req.Email,
		Locale:   req.Locale,
		Timezone: req.Timezone,
		IsActive: true,
	}
	if u.Locale == "" {
		u.Locale = "en"
	}
	if u.Timezone == "" {
		u.Timezone = "UTC"
	}
	if err := u.SetPassword(req.Password); err != nil {
		InternalError(w)
		return
	}
	if err := h.userRepo.Create(r.Context(), u); err != nil {
		if errors.Is(err, domain.ErrConflict) {
			Error(w, http.StatusConflict, "email already in use")
			return
		}
		InternalError(w)
		return
	}

	tenantID := req.TenantID
	if tenantID == "" {
		tenantID = claims.TenantID
	}
	roleID := req.RoleID
	if roleID != "" {
		_ = h.rbacRepo.AssignRole(r.Context(), u.ID, tenantID, roleID)
	}

	JSON(w, http.StatusCreated, map[string]any{"data": toUserAdminResponse(u)})
}

func (h *AdminUsersHandler) Update(w http.ResponseWriter, r *http.Request) {
	u, err := h.userRepo.GetByID(r.Context(), chi.URLParam(r, "id"))
	if err != nil {
		if errors.Is(err, domain.ErrNotFound) {
			NotFound(w)
			return
		}
		InternalError(w)
		return
	}

	var req struct {
		Name     string `json:"name"`
		Email    string `json:"email"`
		Locale   string `json:"locale"`
		Timezone string `json:"timezone"`
		IsActive *bool  `json:"is_active"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		UnprocessableEntity(w, "invalid request body")
		return
	}

	if req.Name != "" {
		u.Name = req.Name
	}
	if req.Email != "" {
		u.Email = req.Email
	}
	if req.Locale != "" {
		u.Locale = req.Locale
	}
	if req.Timezone != "" {
		u.Timezone = req.Timezone
	}
	if req.IsActive != nil {
		u.IsActive = *req.IsActive
	}

	if err := h.userRepo.Update(r.Context(), u); err != nil {
		if errors.Is(err, domain.ErrConflict) {
			Error(w, http.StatusConflict, "email already in use")
			return
		}
		InternalError(w)
		return
	}

	JSON(w, http.StatusOK, map[string]any{"data": toUserAdminResponse(u)})
}

func (h *AdminUsersHandler) Delete(w http.ResponseWriter, r *http.Request) {
	if err := h.userRepo.Delete(r.Context(), chi.URLParam(r, "id")); err != nil {
		if errors.Is(err, domain.ErrNotFound) {
			NotFound(w)
			return
		}
		InternalError(w)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *AdminUsersHandler) AssignRole(w http.ResponseWriter, r *http.Request) {
	claims := middleware.UserClaimsFromContext(r.Context())
	userID := chi.URLParam(r, "id")

	var req struct {
		RoleID   string `json:"role_id"`
		TenantID string `json:"tenant_id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.RoleID == "" {
		UnprocessableEntity(w, "role_id is required")
		return
	}
	tenantID := req.TenantID
	if tenantID == "" {
		tenantID = claims.TenantID
	}

	if err := h.rbacRepo.AssignRole(r.Context(), userID, tenantID, req.RoleID); err != nil {
		InternalError(w)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func toUserAdminResponse(u *domain.User) userAdminResponse {
	return userAdminResponse{
		ID:        u.ID,
		Name:      u.Name,
		Email:     u.Email,
		Locale:    u.Locale,
		Timezone:  u.Timezone,
		IsActive:  u.IsActive,
		CreatedAt: u.CreatedAt,
		UpdatedAt: u.UpdatedAt,
	}
}
