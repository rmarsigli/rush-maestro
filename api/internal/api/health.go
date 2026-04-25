package api

import (
	"context"
	"encoding/json"
	"net/http"
)

type HealthHandler struct {
	userRepo interface {
		Count(ctx context.Context) (int64, error)
	}
}

func NewHealthHandler(userRepo interface {
	Count(ctx context.Context) (int64, error)
}) *HealthHandler {
	return &HealthHandler{userRepo: userRepo}
}

func (h *HealthHandler) Handle(w http.ResponseWriter, r *http.Request) {
	count, _ := h.userRepo.Count(r.Context())
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]any{
		"status":         "ok",
		"setup_required": count == 0,
	})
}
