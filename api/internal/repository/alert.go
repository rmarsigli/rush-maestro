package repository

import (
	"context"
	"encoding/json"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/rush-maestro/rush-maestro/internal/repository/db"
)

type AlertRepository struct {
	pool    *pgxpool.Pool
	queries *db.Queries
}

func NewAlertRepository(pool *pgxpool.Pool) *AlertRepository {
	return &AlertRepository{pool: pool, queries: db.New(pool)}
}

type AlertEvent struct {
	ID           string
	TenantID     string
	Level        string
	Type         string
	CampaignID   *string
	CampaignName *string
	Message      string
	Details      json.RawMessage
	ResolvedAt   *time.Time
	IgnoredAt    *time.Time
	CreatedAt    time.Time
}

func (r *AlertRepository) ListOpen(ctx context.Context, tenantID string) ([]AlertEvent, error) {
	rows, err := r.queries.ListOpenAlerts(ctx, tenantID)
	if err != nil {
		return nil, mapError(err)
	}
	return mapAlerts(rows), nil
}

func (r *AlertRepository) CountOpen(ctx context.Context, tenantID string) (int64, error) {
	return r.queries.CountOpenAlerts(ctx, tenantID)
}

func (r *AlertRepository) Create(ctx context.Context, a AlertEvent) error {
	return mapError(r.queries.CreateAlert(ctx, db.CreateAlertParams{
		ID:           a.ID,
		TenantID:     a.TenantID,
		Level:        a.Level,
		Type:         a.Type,
		CampaignID:   a.CampaignID,
		CampaignName: a.CampaignName,
		Message:      a.Message,
		Details:      a.Details,
	}))
}

func (r *AlertRepository) Resolve(ctx context.Context, id string) error {
	return mapError(r.queries.ResolveAlert(ctx, id))
}

func (r *AlertRepository) Ignore(ctx context.Context, id string) error {
	return mapError(r.queries.IgnoreAlert(ctx, id))
}

func (r *AlertRepository) ListHistory(ctx context.Context, tenantID string, limit int) ([]AlertEvent, error) {
	rows, err := r.queries.ListAlertHistory(ctx, db.ListAlertHistoryParams{
		TenantID: tenantID,
		Limit:    int32(limit),
	})
	if err != nil {
		return nil, mapError(err)
	}
	return mapAlerts(rows), nil
}

func mapAlerts(rows []db.AlertEvent) []AlertEvent {
	events := make([]AlertEvent, len(rows))
	for i, row := range rows {
		events[i] = AlertEvent{
			ID:           row.ID,
			TenantID:     row.TenantID,
			Level:        row.Level,
			Type:         row.Type,
			CampaignID:   row.CampaignID,
			CampaignName: row.CampaignName,
			Message:      row.Message,
			Details:      row.Details,
			ResolvedAt:   tsToTimePtr(row.ResolvedAt),
			IgnoredAt:    tsToTimePtr(row.IgnoredAt),
			CreatedAt:    row.CreatedAt,
		}
	}
	return events
}
