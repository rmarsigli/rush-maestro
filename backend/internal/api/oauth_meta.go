package api

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/url"
	"strings"

	"github.com/rush-maestro/rush-maestro/internal/connector"
	"github.com/rush-maestro/rush-maestro/internal/domain"
)

// OAuthMetaHandler implements the Meta (Facebook/Instagram) OAuth 2.0 flow.
type OAuthMetaHandler struct {
	repo    interface {
		GetByID(ctx context.Context, id string) (*domain.Integration, error)
		Update(ctx context.Context, ig *domain.Integration) error
		GetForTenant(ctx context.Context, tenantID, provider string) (*domain.Integration, error)
		SetTenants(ctx context.Context, integrationID string, tenantIDs []string) error
	}
	resourceStore connector.ResourceStore
	baseURL       string
}

// NewOAuthMetaHandler creates a new Meta OAuth handler.
func NewOAuthMetaHandler(
	repo interface {
		GetByID(ctx context.Context, id string) (*domain.Integration, error)
		Update(ctx context.Context, ig *domain.Integration) error
		GetForTenant(ctx context.Context, tenantID, provider string) (*domain.Integration, error)
		SetTenants(ctx context.Context, integrationID string, tenantIDs []string) error
	},
	resourceStore connector.ResourceStore,
	baseURL string,
) *OAuthMetaHandler {
	return &OAuthMetaHandler{repo: repo, resourceStore: resourceStore, baseURL: baseURL}
}

type metaOAuthState struct {
	IntegrationID string `json:"integration_id"`
	ReturnTo      string `json:"return_to"`
}

func encodeMetaOAuthState(s metaOAuthState) string {
	b, _ := json.Marshal(s)
	return base64.URLEncoding.EncodeToString(b)
}

func decodeMetaOAuthState(s string) (metaOAuthState, error) {
	b, err := base64.URLEncoding.DecodeString(s)
	if err != nil {
		return metaOAuthState{}, err
	}
	var st metaOAuthState
	return st, json.Unmarshal(b, &st)
}

// GET /auth/meta/start?integration_id=xxx
func (h *OAuthMetaHandler) Start(w http.ResponseWriter, r *http.Request) {
	integrationID := r.URL.Query().Get("integration_id")
	if integrationID == "" {
		http.Error(w, "integration_id is required", http.StatusBadRequest)
		return
	}

	ig, err := h.repo.GetByID(r.Context(), integrationID)
	if err != nil {
		if errors.Is(err, domain.ErrNotFound) {
			http.NotFound(w, r)
			return
		}
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}

	if ig.OAuthClientID == nil || ig.OAuthClientSecret == nil {
		http.Error(w, "integration credentials are not configured", http.StatusBadRequest)
		return
	}

	state := encodeMetaOAuthState(metaOAuthState{
		IntegrationID: integrationID,
		ReturnTo:      "/settings/integrations",
	})

	scopes := "pages_manage_posts,instagram_content_publish,pages_read_engagement"

	params := url.Values{
		"client_id":     {*ig.OAuthClientID},
		"redirect_uri":  {h.baseURL + "/auth/meta/callback"},
		"response_type": {"code"},
		"scope":         {scopes},
		"state":         {state},
	}

	http.Redirect(w, r, "https://www.facebook.com/v18.0/dialog/oauth?"+params.Encode(), http.StatusFound)
}

// GET /auth/meta/callback
func (h *OAuthMetaHandler) Callback(w http.ResponseWriter, r *http.Request) {
	if oauthErr := r.URL.Query().Get("error"); oauthErr != "" {
		h.htmlError(w, "OAuth Error", oauthErr)
		return
	}

	code := r.URL.Query().Get("code")
	if code == "" {
		h.htmlError(w, "Missing Code", "No authorization code received from Meta.")
		return
	}

	state, err := decodeMetaOAuthState(r.URL.Query().Get("state"))
	if err != nil || state.IntegrationID == "" {
		h.htmlError(w, "Invalid State", "Could not parse OAuth state parameter.")
		return
	}

	ig, err := h.repo.GetByID(r.Context(), state.IntegrationID)
	if err != nil || ig.OAuthClientID == nil || ig.OAuthClientSecret == nil {
		h.htmlError(w, "Integration Not Found", "The integration was deleted or credentials are missing.")
		return
	}

	// Exchange code for short-lived access token
	shortToken, err := exchangeMetaCode(r.Context(), metaExchangeParams{
		Code:         code,
		ClientID:     *ig.OAuthClientID,
		ClientSecret: *ig.OAuthClientSecret,
		RedirectURI:  h.baseURL + "/auth/meta/callback",
	})
	if err != nil {
		msg := err.Error()
		ig.Status = domain.StatusError
		ig.ErrorMessage = &msg
		_ = h.repo.Update(r.Context(), ig)
		h.htmlError(w, "Token Exchange Failed", msg)
		return
	}

	// Exchange for long-lived token
	longToken, err := exchangeLongLivedToken(r.Context(), *ig.OAuthClientID, *ig.OAuthClientSecret, shortToken)
	if err != nil {
		msg := err.Error()
		ig.Status = domain.StatusError
		ig.ErrorMessage = &msg
		_ = h.repo.Update(r.Context(), ig)
		h.htmlError(w, "Long-Lived Token Failed", msg)
		return
	}

	ig.RefreshToken = &longToken
	ig.Status = domain.StatusConnected
	ig.ErrorMessage = nil
	if err := h.repo.Update(r.Context(), ig); err != nil {
		h.htmlError(w, "Save Failed", "Could not save access token.")
		return
	}

	// Auto-discover resources for all linked tenants via the connector's hook.
	if schema, err := connector.GetProvider(ig.Provider); err == nil && schema.DiscoverResources != nil {
		_ = schema.DiscoverResources(r.Context(), ig, h.resourceStore)
	}

	returnTo := state.ReturnTo
	if returnTo == "" {
		returnTo = "/settings/integrations"
	}
	http.Redirect(w, r, returnTo+"?connected=1&provider=meta", http.StatusFound)
}

func (h *OAuthMetaHandler) htmlError(w http.ResponseWriter, title, detail string) {
	safe := strings.NewReplacer("&", "&amp;", "<", "&lt;", ">", "&gt;", `"`, "&quot;").Replace(detail)
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.WriteHeader(http.StatusBadRequest)
	fmt.Fprintf(w, `<!doctype html><html><head><meta charset="utf-8"><title>%s</title>
<style>body{font-family:sans-serif;max-width:640px;margin:60px auto;padding:20px;line-height:1.6}</style>
</head><body><h1>❌ %s</h1><p>%s</p></body></html>`, title, title, safe)
}

type metaExchangeParams struct {
	Code         string
	ClientID     string
	ClientSecret string
	RedirectURI  string
}

type metaTokenResponse struct {
	AccessToken string `json:"access_token"`
	TokenType   string `json:"token_type"`
	ExpiresIn   int    `json:"expires_in"`
	Error       struct {
		Message string `json:"message"`
		Type    string `json:"type"`
		Code    int    `json:"code"`
	} `json:"error"`
}

func exchangeMetaCode(ctx context.Context, p metaExchangeParams) (string, error) {
	params := url.Values{
		"code":          {p.Code},
		"client_id":     {p.ClientID},
		"client_secret": {p.ClientSecret},
		"redirect_uri":  {p.RedirectURI},
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost,
		"https://graph.facebook.com/v18.0/oauth/access_token?"+params.Encode(),
		nil,
	)
	if err != nil {
		return "", err
	}

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	var tok metaTokenResponse
	if err := json.NewDecoder(resp.Body).Decode(&tok); err != nil {
		return "", fmt.Errorf("failed to decode token response")
	}

	if tok.Error.Message != "" {
		return "", fmt.Errorf("meta oauth error: %s", tok.Error.Message)
	}
	if tok.AccessToken == "" {
		return "", fmt.Errorf("no access_token returned")
	}

	return tok.AccessToken, nil
}

func exchangeLongLivedToken(ctx context.Context, clientID, clientSecret, shortToken string) (string, error) {
	params := url.Values{
		"grant_type":        {"fb_exchange_token"},
		"client_id":         {clientID},
		"client_secret":     {clientSecret},
		"fb_exchange_token": {shortToken},
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodGet,
		"https://graph.facebook.com/v18.0/oauth/access_token?"+params.Encode(),
		nil,
	)
	if err != nil {
		return "", err
	}

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	var tok metaTokenResponse
	if err := json.NewDecoder(resp.Body).Decode(&tok); err != nil {
		return "", fmt.Errorf("failed to decode long-lived token response")
	}

	if tok.Error.Message != "" {
		return "", fmt.Errorf("meta long-lived token error: %s", tok.Error.Message)
	}
	if tok.AccessToken == "" {
		return "", fmt.Errorf("no long-lived access_token returned")
	}

	return tok.AccessToken, nil
}
