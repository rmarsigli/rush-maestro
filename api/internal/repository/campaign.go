package repository

import (
	"context"
	"encoding/json"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/rush-maestro/rush-maestro/internal/repository/db"
)

type CampaignRepository struct {
	pool    *pgxpool.Pool
	queries *db.Queries
}

func NewCampaignRepository(pool *pgxpool.Pool) *CampaignRepository {
	return &CampaignRepository{pool: pool, queries: db.New(pool)}
}

type Campaign struct {
	ID         string
	TenantID   string
	Slug       string
	Data       json.RawMessage
	DeployedAt interface{}
}

func (r *CampaignRepository) List(ctx context.Context, tenantID string) ([]Campaign, error) {
	rows, err := r.queries.ListCampaigns(ctx, tenantID)
	if err != nil {
		return nil, mapError(err)
	}
	campaigns := make([]Campaign, len(rows))
	for i, row := range rows {
		campaigns[i] = Campaign{
			ID:       row.ID,
			TenantID: row.TenantID,
			Slug:     row.Slug,
			Data:     row.Data,
		}
	}
	return campaigns, nil
}

func (r *CampaignRepository) GetBySlug(ctx context.Context, tenantID, slug string) (*Campaign, error) {
	row, err := r.queries.GetCampaignBySlug(ctx, db.GetCampaignBySlugParams{
		TenantID: tenantID,
		Slug:     slug,
	})
	if err != nil {
		return nil, mapError(err)
	}
	return &Campaign{ID: row.ID, TenantID: row.TenantID, Slug: row.Slug, Data: row.Data}, nil
}

func (r *CampaignRepository) Upsert(ctx context.Context, id, tenantID, slug string, data json.RawMessage) error {
	return mapError(r.queries.UpsertCampaign(ctx, db.UpsertCampaignParams{
		ID:       id,
		TenantID: tenantID,
		Slug:     slug,
		Data:     data,
	}))
}

func (r *CampaignRepository) MarkDeployed(ctx context.Context, id string) error {
	return mapError(r.queries.MarkCampaignDeployed(ctx, id))
}

func (r *CampaignRepository) Delete(ctx context.Context, id string) error {
	return mapError(r.queries.DeleteCampaign(ctx, id))
}
