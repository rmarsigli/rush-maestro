package domain

import (
	"encoding/json"
	"time"
)

type ConnectorResource struct {
	ID            string
	TenantID      string
	IntegrationID string
	Provider      IntegrationProvider
	ResourceType  string
	ResourceID    string
	ResourceName  *string
	Metadata      map[string]any
	CreatedAt     time.Time
	UpdatedAt     time.Time
}

// MetaMetadata extracts Meta-specific fields from Metadata.
func (r *ConnectorResource) MetaMetadata() struct {
	IgUserID   string
	IgUsername string
} {
	var out struct{ IgUserID, IgUsername string }
	if r.Metadata != nil {
		if v, ok := r.Metadata["ig_user_id"].(string); ok {
			out.IgUserID = v
		}
		if v, ok := r.Metadata["ig_username"].(string); ok {
			out.IgUsername = v
		}
	}
	return out
}

// MarshalMetadata returns the Metadata map as JSON bytes.
func (r *ConnectorResource) MarshalMetadata() []byte {
	if r.Metadata == nil {
		return []byte("{}")
	}
	b, _ := json.Marshal(r.Metadata)
	return b
}
