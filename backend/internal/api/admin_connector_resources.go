package api

import (
	"context"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/rush-maestro/rush-maestro/internal/domain"
)

type ConnectorResourcesHandler struct {
	repo interface {
		List(ctx context.Context, tenantID string, provider domain.IntegrationProvider, resourceType string) ([]*domain.ConnectorResource, error)
	}
}

func NewConnectorResourcesHandler(repo interface {
	List(ctx context.Context, tenantID string, provider domain.IntegrationProvider, resourceType string) ([]*domain.ConnectorResource, error)
}) *ConnectorResourcesHandler {
	return &ConnectorResourcesHandler{repo: repo}
}

// GET /admin/tenants/{tenantId}/connectors?provider=meta&resource_type=page
func (h *ConnectorResourcesHandler) List(w http.ResponseWriter, r *http.Request) {
	tenantID := chi.URLParam(r, "tenantId")
	provider := r.URL.Query().Get("provider")
	resourceType := r.URL.Query().Get("resource_type")
	if provider == "" || resourceType == "" {
		Error(w, http.StatusBadRequest, "provider and resource_type query params are required")
		return
	}

	resources, err := h.repo.List(r.Context(), tenantID, domain.IntegrationProvider(provider), resourceType)
	if err != nil {
		InternalError(w)
		return
	}

	JSON(w, http.StatusOK, map[string]any{"data": resources})
}
