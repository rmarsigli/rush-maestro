package connector

import (
	"context"

	"github.com/rush-maestro/rush-maestro/internal/domain"
)

type FieldType string

const (
	FieldTypeText     FieldType = "text"
	FieldTypePassword FieldType = "password"
	FieldTypeSelect   FieldType = "select"
	FieldTypeURL      FieldType = "url"
	FieldTypeNumber   FieldType = "number"
)

type SelectOption struct {
	Label string `json:"label"`
	Value string `json:"value"`
}

type FieldSchema struct {
	Key         string         `json:"key"`
	Label       string         `json:"label"`
	Placeholder string         `json:"placeholder,omitempty"`
	Type        FieldType      `json:"type"`
	Required    bool           `json:"required"`
	HelpText    string         `json:"help_text,omitempty"`
	Options     []SelectOption `json:"options,omitempty"`
}

// IntegrationSchema describes everything the UI needs to render the setup card and
// configuration modal for a provider. Register with RegisterProvider — do not
// instantiate directly outside of provider init() functions.
type IntegrationSchema struct {
	Provider    domain.IntegrationProvider `json:"provider"`
	Group       domain.IntegrationGroup    `json:"group"`
	DisplayName string                     `json:"display_name"`
	Description string                     `json:"description"`
	LogoSVG     string                     `json:"logo_svg"`

	// ConfigFields are non-secret fields (customer ID, bucket name, etc.).
	ConfigFields []FieldSchema `json:"config_fields"`

	// CredentialFields are secret fields. Values are masked in GET responses.
	CredentialFields []FieldSchema `json:"credential_fields"`

	// OAuthFlow: when true, the UI shows a "Connect via OAuth" button.
	OAuthFlow      bool   `json:"oauth_flow"`
	OAuthStartPath string `json:"oauth_start_path,omitempty"`

	// TestConnection is called by POST /admin/integrations/{id}/test.
	// Return nil on success.
	TestConnection func(ctx context.Context, integration *domain.Integration) error `json:"-"`

	// DiscoverResources is called after a successful OAuth connection.
	// It fetches resources from the provider API and persists them via store.
	DiscoverResources func(ctx context.Context, integration *domain.Integration, store ResourceStore) error `json:"-"`
}

// ResourceStore is the generic persistence interface for connector resources.
type ResourceStore interface {
	DeleteByTenantProvider(ctx context.Context, tenantID string, provider domain.IntegrationProvider) error
	Upsert(ctx context.Context, res *domain.ConnectorResource) error
	List(ctx context.Context, tenantID string, provider domain.IntegrationProvider, resourceType string) ([]*domain.ConnectorResource, error)
}
