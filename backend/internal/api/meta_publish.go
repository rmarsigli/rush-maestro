package api

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/rush-maestro/rush-maestro/internal/connector/media"
	"github.com/rush-maestro/rush-maestro/internal/connector/meta"
	"github.com/rush-maestro/rush-maestro/internal/domain"
)

type MetaPublishHandler struct {
	postRepo        interface {
		GetByID(ctx context.Context, id string) (*domain.Post, error)
		UpdateStatus(ctx context.Context, id, status string, publishedAt interface{}) error
	}
	integrationRepo interface {
		GetForTenant(ctx context.Context, tenantID, provider string) (*domain.Integration, error)
	}
	resourceRepo    interface {
		GetByID(ctx context.Context, id string) (*domain.ConnectorResource, error)
		List(ctx context.Context, tenantID string, provider domain.IntegrationProvider, resourceType string) ([]*domain.ConnectorResource, error)
	}
	mediaResolver media.Resolver
}

func NewMetaPublishHandler(
	postRepo interface {
		GetByID(ctx context.Context, id string) (*domain.Post, error)
		UpdateStatus(ctx context.Context, id, status string, publishedAt interface{}) error
	},
	integrationRepo interface {
		GetForTenant(ctx context.Context, tenantID, provider string) (*domain.Integration, error)
	},
	resourceRepo interface {
		GetByID(ctx context.Context, id string) (*domain.ConnectorResource, error)
		List(ctx context.Context, tenantID string, provider domain.IntegrationProvider, resourceType string) ([]*domain.ConnectorResource, error)
	},
	mediaResolver media.Resolver,
) *MetaPublishHandler {
	return &MetaPublishHandler{
		postRepo:        postRepo,
		integrationRepo: integrationRepo,
		resourceRepo:    resourceRepo,
		mediaResolver:   mediaResolver,
	}
}

// GET /admin/tenants/{tenantId}/meta/accounts
func (h *MetaPublishHandler) ListAccounts(w http.ResponseWriter, r *http.Request) {
	tenantID := chi.URLParam(r, "tenantId")

	accounts, err := h.resourceRepo.List(r.Context(), tenantID, domain.ProviderMeta, "page")
	if err != nil {
		InternalError(w)
		return
	}

	JSON(w, http.StatusOK, map[string]any{"data": accounts})
}

// POST /admin/tenants/{tenantId}/meta/publish
func (h *MetaPublishHandler) Publish(w http.ResponseWriter, r *http.Request) {
	tenantID := chi.URLParam(r, "tenantId")

	var req struct {
		PostID    string `json:"post_id"`
		AccountID string `json:"account_id"`
		Platform  string `json:"platform"` // "instagram" or "facebook"
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		UnprocessableEntity(w, "invalid request body")
		return
	}
	if req.PostID == "" || req.AccountID == "" || req.Platform == "" {
		UnprocessableEntity(w, "post_id, account_id and platform are required")
		return
	}

	post, err := h.postRepo.GetByID(r.Context(), req.PostID)
	if err != nil {
		if errors.Is(err, domain.ErrNotFound) {
			NotFound(w)
			return
		}
		InternalError(w)
		return
	}

	if post.TenantID != tenantID {
		Forbidden(w)
		return
	}

	if !post.Status.CanTransitionTo(domain.PostStatusPublished) {
		UnprocessableEntity(w, "cannot publish post in status "+string(post.Status))
		return
	}

	ig, err := h.integrationRepo.GetForTenant(r.Context(), tenantID, string(domain.ProviderMeta))
	if err != nil {
		if errors.Is(err, domain.ErrNotFound) {
			Error(w, http.StatusBadRequest, "no connected Meta integration for this tenant")
			return
		}
		InternalError(w)
		return
	}

	if ig.RefreshToken == nil || *ig.RefreshToken == "" {
		Error(w, http.StatusBadRequest, "Meta integration is not authorized")
		return
	}

	resource, err := h.resourceRepo.GetByID(r.Context(), req.AccountID)
	if err != nil {
		if errors.Is(err, domain.ErrNotFound) {
			NotFound(w)
			return
		}
		InternalError(w)
		return
	}

	if resource.TenantID != tenantID || resource.Provider != domain.ProviderMeta {
		Forbidden(w)
		return
	}

	client := meta.NewClient(*ig.RefreshToken)
	caption := buildCaption(post)

	var metaPostID string
	switch req.Platform {
	case "instagram":
		meta := resource.MetaMetadata()
		if meta.IgUserID == "" {
			Error(w, http.StatusBadRequest, "selected account has no Instagram Business account linked")
			return
		}
		metaPostID, err = h.publishInstagram(r.Context(), client, meta.IgUserID, post, caption)
	case "facebook":
		metaPostID, err = h.publishFacebook(r.Context(), client, resource.ResourceID, post, caption)
	default:
		UnprocessableEntity(w, "platform must be 'instagram' or 'facebook'")
		return
	}

	if err != nil {
		Error(w, http.StatusBadGateway, fmt.Sprintf("Meta publish failed: %v", err))
		return
	}

	now := time.Now()
	if err := h.postRepo.UpdateStatus(r.Context(), post.ID, string(domain.PostStatusPublished), now); err != nil {
		InternalError(w)
		return
	}

	JSON(w, http.StatusOK, map[string]any{
		"data": map[string]any{
			"post_id":      post.ID,
			"status":       domain.PostStatusPublished,
			"meta_post_id": metaPostID,
			"platform":     req.Platform,
			"published_at": now,
		},
	})
}

func (h *MetaPublishHandler) publishInstagram(ctx context.Context, client *meta.Client, igUserID string, post *domain.Post, caption string) (string, error) {
	var imageURL string
	if post.MediaPath != nil && *post.MediaPath != "" {
		imageURL = h.mediaResolver.ResolveURL(post.TenantID, *post.MediaPath)
	}

	if imageURL == "" {
		return "", fmt.Errorf("instagram posts require an image")
	}

	containerID, err := client.CreateIGMediaContainer(ctx, igUserID, imageURL, caption, false)
	if err != nil {
		return "", fmt.Errorf("create container: %w", err)
	}

	if err := client.PollContainerStatus(ctx, containerID); err != nil {
		return "", fmt.Errorf("container not ready: %w", err)
	}

	mediaID, err := client.PublishIGMedia(ctx, igUserID, containerID)
	if err != nil {
		return "", fmt.Errorf("publish media: %w", err)
	}
	return mediaID, nil
}

func (h *MetaPublishHandler) publishFacebook(ctx context.Context, client *meta.Client, pageID string, post *domain.Post, caption string) (string, error) {
	var link string
	if post.MediaPath != nil && *post.MediaPath != "" {
		link = h.mediaResolver.ResolveURL(post.TenantID, *post.MediaPath)
	}

	postID, err := client.PostToPage(ctx, pageID, caption, link)
	if err != nil {
		return "", fmt.Errorf("post to page: %w", err)
	}
	return postID, nil
}

func buildCaption(post *domain.Post) string {
	var b strings.Builder
	if post.Title != nil && *post.Title != "" {
		b.WriteString(*post.Title)
		b.WriteString("\n\n")
	}
	b.WriteString(post.Content)
	if len(post.Hashtags) > 0 {
		b.WriteString("\n\n")
		for i, h := range post.Hashtags {
			if i > 0 {
				b.WriteString(" ")
			}
			b.WriteString(h)
		}
	}
	return b.String()
}
