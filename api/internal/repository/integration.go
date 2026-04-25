package repository

import (
	"context"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/rush-maestro/rush-maestro/internal/domain"
	"github.com/rush-maestro/rush-maestro/internal/repository/db"
)

type IntegrationRepository struct {
	pool    *pgxpool.Pool
	queries *db.Queries
}

func NewIntegrationRepository(pool *pgxpool.Pool) *IntegrationRepository {
	return &IntegrationRepository{pool: pool, queries: db.New(pool)}
}

func (r *IntegrationRepository) List(ctx context.Context) ([]*domain.Integration, error) {
	rows, err := r.queries.ListIntegrations(ctx)
	if err != nil {
		return nil, mapError(err)
	}
	integrations := make([]*domain.Integration, len(rows))
	for i, row := range rows {
		ig := mapIntegration(row)
		tenantIDs, _ := r.queries.GetTenantsForIntegration(ctx, row.ID)
		ig.TenantIDs = tenantIDs
		integrations[i] = ig
	}
	return integrations, nil
}

func (r *IntegrationRepository) GetByID(ctx context.Context, id string) (*domain.Integration, error) {
	row, err := r.queries.GetIntegrationByID(ctx, id)
	if err != nil {
		return nil, mapError(err)
	}
	ig := mapIntegration(row)
	ig.TenantIDs, _ = r.queries.GetTenantsForIntegration(ctx, id)
	return ig, nil
}

func (r *IntegrationRepository) GetForTenant(ctx context.Context, tenantID, provider string) (*domain.Integration, error) {
	row, err := r.queries.GetIntegrationForTenant(ctx, db.GetIntegrationForTenantParams{
		TenantID: tenantID,
		Provider: provider,
	})
	if err != nil {
		return nil, mapError(err)
	}
	return mapIntegration(row), nil
}

func (r *IntegrationRepository) Create(ctx context.Context, ig *domain.Integration) error {
	return mapError(r.queries.CreateIntegration(ctx, db.CreateIntegrationParams{
		ID:               ig.ID,
		Name:             ig.Name,
		Provider:         string(ig.Provider),
		Group:            string(ig.Group),
		OauthClientID:    ig.OAuthClientID,
		OauthClientSecret: ig.OAuthClientSecret,
		DeveloperToken:   ig.DeveloperToken,
		LoginCustomerID:  ig.LoginCustomerID,
		Status:           string(ig.Status),
	}))
}

func (r *IntegrationRepository) Update(ctx context.Context, ig *domain.Integration) error {
	return mapError(r.queries.UpdateIntegration(ctx, db.UpdateIntegrationParams{
		ID:               ig.ID,
		Name:             ig.Name,
		OauthClientID:    ig.OAuthClientID,
		OauthClientSecret: ig.OAuthClientSecret,
		DeveloperToken:   ig.DeveloperToken,
		LoginCustomerID:  ig.LoginCustomerID,
		RefreshToken:     ig.RefreshToken,
		Status:           string(ig.Status),
		ErrorMessage:     ig.ErrorMessage,
	}))
}

func (r *IntegrationRepository) Delete(ctx context.Context, id string) error {
	return mapError(r.queries.DeleteIntegration(ctx, id))
}

func (r *IntegrationRepository) SetTenants(ctx context.Context, integrationID string, tenantIDs []string) error {
	if err := r.queries.DeleteIntegrationTenants(ctx, integrationID); err != nil {
		return mapError(err)
	}
	for _, tid := range tenantIDs {
		if err := r.queries.InsertIntegrationTenant(ctx, db.InsertIntegrationTenantParams{
			IntegrationID: integrationID,
			TenantID:      tid,
		}); err != nil {
			return mapError(err)
		}
	}
	return nil
}

func mapIntegration(row db.Integration) *domain.Integration {
	return &domain.Integration{
		ID:                row.ID,
		Name:              row.Name,
		Provider:          domain.IntegrationProvider(row.Provider),
		Group:             domain.IntegrationGroup(row.Group),
		OAuthClientID:     row.OauthClientID,
		OAuthClientSecret: row.OauthClientSecret,
		DeveloperToken:    row.DeveloperToken,
		LoginCustomerID:   row.LoginCustomerID,
		RefreshToken:      row.RefreshToken,
		Status:            domain.IntegrationStatus(row.Status),
		ErrorMessage:      row.ErrorMessage,
		CreatedAt:         row.CreatedAt,
		UpdatedAt:         row.UpdatedAt,
	}
}
