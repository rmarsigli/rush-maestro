package repository

import (
	"context"
	"encoding/json"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/rush-maestro/rush-maestro/internal/domain"
	"github.com/rush-maestro/rush-maestro/internal/repository/db"
)

type ConnectorResourceRepository struct {
	pool    *pgxpool.Pool
	queries *db.Queries
}

func NewConnectorResourceRepository(pool *pgxpool.Pool) *ConnectorResourceRepository {
	return &ConnectorResourceRepository{pool: pool, queries: db.New(pool)}
}

func (r *ConnectorResourceRepository) List(
	ctx context.Context,
	tenantID string,
	provider domain.IntegrationProvider,
	resourceType string,
) ([]*domain.ConnectorResource, error) {
	rows, err := r.queries.ListConnectorResources(ctx, db.ListConnectorResourcesParams{
		TenantID:     tenantID,
		Provider:     string(provider),
		ResourceType: resourceType,
	})
	if err != nil {
		return nil, mapError(err)
	}
	resources := make([]*domain.ConnectorResource, len(rows))
	for i, row := range rows {
		resources[i] = mapConnectorResource(row)
	}
	return resources, nil
}

func (r *ConnectorResourceRepository) GetByID(ctx context.Context, id string) (*domain.ConnectorResource, error) {
	row, err := r.queries.GetConnectorResourceByID(ctx, id)
	if err != nil {
		return nil, mapError(err)
	}
	return mapConnectorResource(row), nil
}

func (r *ConnectorResourceRepository) Upsert(ctx context.Context, res *domain.ConnectorResource) error {
	return mapError(r.queries.UpsertConnectorResource(ctx, db.UpsertConnectorResourceParams{
		ID:            res.ID,
		TenantID:      res.TenantID,
		IntegrationID: res.IntegrationID,
		Provider:      string(res.Provider),
		ResourceType:  res.ResourceType,
		ResourceID:    res.ResourceID,
		ResourceName:  res.ResourceName,
		Metadata:      res.MarshalMetadata(),
	}))
}

func (r *ConnectorResourceRepository) DeleteByTenantProvider(
	ctx context.Context,
	tenantID string,
	provider domain.IntegrationProvider,
) error {
	return mapError(r.queries.DeleteConnectorResourcesByTenantProvider(ctx, db.DeleteConnectorResourcesByTenantProviderParams{
		TenantID: tenantID,
		Provider: string(provider),
	}))
}

func (r *ConnectorResourceRepository) Delete(ctx context.Context, id string) error {
	return mapError(r.queries.DeleteConnectorResource(ctx, id))
}

func mapConnectorResource(row db.ConnectorResource) *domain.ConnectorResource {
	var metadata map[string]any
	if len(row.Metadata) > 0 && string(row.Metadata) != "null" {
		_ = json.Unmarshal(row.Metadata, &metadata)
	}
	if metadata == nil {
		metadata = map[string]any{}
	}
	return &domain.ConnectorResource{
		ID:            row.ID,
		TenantID:      row.TenantID,
		IntegrationID: row.IntegrationID,
		Provider:      domain.IntegrationProvider(row.Provider),
		ResourceType:  row.ResourceType,
		ResourceID:    row.ResourceID,
		ResourceName:  row.ResourceName,
		Metadata:      metadata,
		CreatedAt:     row.CreatedAt,
		UpdatedAt:     row.UpdatedAt,
	}
}
