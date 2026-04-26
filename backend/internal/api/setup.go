package api

import (
	"context"
	"encoding/json"
	"net/http"
	"time"

	"github.com/rush-maestro/rush-maestro/internal/domain"
)

type SetupHandler struct {
	userRepo interface {
		Count(ctx context.Context) (int64, error)
		Create(ctx context.Context, u *domain.User) error
	}
	tenantRepo interface {
		List(ctx context.Context) ([]*domain.Tenant, error)
	}
	rbacRepo interface {
		AssignRole(ctx context.Context, userID, tenantID, roleID string) error
		GetPermissionsForUser(ctx context.Context, userID, tenantID string) ([]string, error)
	}
	jwtSvc        *domain.JWTService
	cookieDomain  string
	secureCookies bool
}

func NewSetupHandler(
	userRepo interface {
		Count(ctx context.Context) (int64, error)
		Create(ctx context.Context, u *domain.User) error
	},
	tenantRepo interface {
		List(ctx context.Context) ([]*domain.Tenant, error)
	},
	rbacRepo interface {
		AssignRole(ctx context.Context, userID, tenantID, roleID string) error
		GetPermissionsForUser(ctx context.Context, userID, tenantID string) ([]string, error)
	},
	jwtSvc *domain.JWTService,
	cookieDomain string,
	secureCookies bool,
) *SetupHandler {
	return &SetupHandler{
		userRepo:      userRepo,
		tenantRepo:    tenantRepo,
		rbacRepo:      rbacRepo,
		jwtSvc:        jwtSvc,
		cookieDomain:  cookieDomain,
		secureCookies: secureCookies,
	}
}

func (h *SetupHandler) Create(w http.ResponseWriter, r *http.Request) {
	count, err := h.userRepo.Count(r.Context())
	if err != nil || count > 0 {
		http.NotFound(w, r)
		return
	}

	var req struct {
		Name     string `json:"name"`
		Email    string `json:"email"`
		Password string `json:"password"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		UnprocessableEntity(w, "invalid request body")
		return
	}
	if req.Name == "" {
		UnprocessableEntity(w, "name is required")
		return
	}
	if req.Email == "" {
		UnprocessableEntity(w, "email is required")
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
		Locale:   "en",
		Timezone: "UTC",
		IsActive: true,
	}
	if err := u.SetPassword(req.Password); err != nil {
		InternalError(w)
		return
	}
	if err := h.userRepo.Create(r.Context(), u); err != nil {
		InternalError(w)
		return
	}

	tenants, _ := h.tenantRepo.List(r.Context())
	for _, t := range tenants {
		_ = h.rbacRepo.AssignRole(r.Context(), u.ID, t.ID, "role_owner")
	}

	var (
		accessToken string
		expiresAt   time.Time
		needsTenant bool
	)

	if len(tenants) > 0 {
		perms, _ := h.rbacRepo.GetPermissionsForUser(r.Context(), u.ID, tenants[0].ID)
		claims := domain.UserClaims{
			UserID:      u.ID,
			TenantID:    tenants[0].ID,
			Permissions: perms,
		}
		pair, err := h.jwtSvc.IssueTokenPair(claims)
		if err != nil {
			InternalError(w)
			return
		}
		h.setRefreshCookie(w, pair.RefreshToken)
		accessToken = pair.AccessToken
		expiresAt = pair.ExpiresAt
	} else {
		pair, err := h.jwtSvc.IssueTokenPair(domain.UserClaims{
			UserID:      u.ID,
			TenantID:    "",
			Permissions: []string{"create:tenant", "view-any:tenant"},
		})
		if err != nil {
			InternalError(w)
			return
		}
		h.setRefreshCookie(w, pair.RefreshToken)
		accessToken = pair.AccessToken
		expiresAt = pair.ExpiresAt
		needsTenant = true
	}

	JSON(w, http.StatusCreated, map[string]any{
		"id":           u.ID,
		"name":         u.Name,
		"email":        u.Email,
		"access_token": accessToken,
		"expires_at":   expiresAt,
		"needs_tenant": needsTenant,
		"user":         map[string]any{"id": u.ID, "name": u.Name, "email": u.Email},
	})
}

func (h *SetupHandler) setRefreshCookie(w http.ResponseWriter, token string) {
	http.SetCookie(w, &http.Cookie{
		Name:     refreshCookieName,
		Value:    token,
		Path:     "/auth/refresh",
		Domain:   h.cookieDomain,
		MaxAge:   7 * 24 * 60 * 60,
		HttpOnly: true,
		Secure:   h.secureCookies,
		SameSite: http.SameSiteStrictMode,
	})
}
