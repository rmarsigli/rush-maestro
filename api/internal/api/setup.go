package api

import (
	"context"
	"encoding/json"
	"net/http"

	"github.com/rush-maestro/rush-maestro/internal/domain"
)

type SetupHandler struct {
	userRepo interface {
		Count(ctx context.Context) (int64, error)
		Create(ctx context.Context, u *domain.User) error
	}
}

func NewSetupHandler(userRepo interface {
	Count(ctx context.Context) (int64, error)
	Create(ctx context.Context, u *domain.User) error
}) *SetupHandler {
	return &SetupHandler{userRepo: userRepo}
}

type setupRequest struct {
	Name     string `json:"name"`
	Email    string `json:"email"`
	Password string `json:"password"`
}

func (h *SetupHandler) Create(w http.ResponseWriter, r *http.Request) {
	count, err := h.userRepo.Count(r.Context())
	if err != nil || count > 0 {
		http.NotFound(w, r)
		return
	}

	var req setupRequest
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

	JSON(w, http.StatusCreated, map[string]any{
		"id":    u.ID,
		"name":  u.Name,
		"email": u.Email,
	})
}
