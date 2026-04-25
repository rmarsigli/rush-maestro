package domain

import "time"

type IntegrationProvider string

const (
	ProviderGoogleAds IntegrationProvider = "google_ads"
	ProviderMeta      IntegrationProvider = "meta"
	ProviderR2        IntegrationProvider = "r2"
	ProviderS3        IntegrationProvider = "s3"
	ProviderClaude    IntegrationProvider = "claude"
	ProviderOpenAI    IntegrationProvider = "openai"
	ProviderGroq      IntegrationProvider = "groq"
	ProviderGemini    IntegrationProvider = "gemini"
	ProviderBrevo     IntegrationProvider = "brevo"
	ProviderSendible  IntegrationProvider = "sendible"
	ProviderSentry    IntegrationProvider = "sentry"
)

type IntegrationGroup string

const (
	GroupAds         IntegrationGroup = "ads"
	GroupSocialMedia IntegrationGroup = "social_media"
	GroupMedia       IntegrationGroup = "media"
	GroupLLM         IntegrationGroup = "llm"
	GroupEmail       IntegrationGroup = "email"
	GroupMonitoring  IntegrationGroup = "monitoring"
)

type IntegrationStatus string

const (
	StatusPending   IntegrationStatus = "pending"
	StatusConnected IntegrationStatus = "connected"
	StatusError     IntegrationStatus = "error"
)

type Integration struct {
	ID                string
	Name              string
	Provider          IntegrationProvider
	Group             IntegrationGroup
	OAuthClientID     *string
	OAuthClientSecret *string
	DeveloperToken    *string
	LoginCustomerID   *string
	RefreshToken      *string
	Status            IntegrationStatus
	ErrorMessage      *string
	TenantIDs         []string
	CreatedAt         time.Time
	UpdatedAt         time.Time
}

func (i *Integration) GoogleAdsCredentials() *GoogleAdsCreds {
	if i.Provider != ProviderGoogleAds || i.Status != StatusConnected {
		return nil
	}
	if i.OAuthClientID == nil || i.OAuthClientSecret == nil ||
		i.DeveloperToken == nil || i.RefreshToken == nil {
		return nil
	}
	return &GoogleAdsCreds{
		ClientID:        *i.OAuthClientID,
		ClientSecret:    *i.OAuthClientSecret,
		DeveloperToken:  *i.DeveloperToken,
		LoginCustomerID: derefStr(i.LoginCustomerID),
		RefreshToken:    *i.RefreshToken,
	}
}

type GoogleAdsCreds struct {
	ClientID        string
	ClientSecret    string
	DeveloperToken  string
	LoginCustomerID string
	RefreshToken    string
}

func derefStr(s *string) string {
	if s == nil {
		return ""
	}
	return *s
}
