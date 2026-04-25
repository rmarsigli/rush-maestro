package repository

import (
	"context"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/rush-maestro/rush-maestro/internal/domain"
	"github.com/rush-maestro/rush-maestro/internal/repository/db"
)

type ReportRepository struct {
	pool    *pgxpool.Pool
	queries *db.Queries
}

func NewReportRepository(pool *pgxpool.Pool) *ReportRepository {
	return &ReportRepository{pool: pool, queries: db.New(pool)}
}

func (r *ReportRepository) List(ctx context.Context, tenantID string) ([]*domain.Report, error) {
	rows, err := r.queries.ListReports(ctx, tenantID)
	if err != nil {
		return nil, mapError(err)
	}
	reports := make([]*domain.Report, len(rows))
	for i, row := range rows {
		reports[i] = &domain.Report{
			ID:        row.ID,
			TenantID:  row.TenantID,
			Slug:      row.Slug,
			Type:      domain.ReportType(row.Type),
			Title:     row.Title,
			CreatedAt: row.CreatedAt,
		}
	}
	return reports, nil
}

func (r *ReportRepository) GetBySlug(ctx context.Context, tenantID, slug string) (*domain.Report, error) {
	row, err := r.queries.GetReportBySlug(ctx, db.GetReportBySlugParams{
		TenantID: tenantID,
		Slug:     slug,
	})
	if err != nil {
		return nil, mapError(err)
	}
	return mapReport(row), nil
}

func (r *ReportRepository) GetByID(ctx context.Context, id string) (*domain.Report, error) {
	row, err := r.queries.GetReportByID(ctx, id)
	if err != nil {
		return nil, mapError(err)
	}
	return mapReport(row), nil
}

func (r *ReportRepository) Create(ctx context.Context, rep *domain.Report) error {
	return mapError(r.queries.CreateReport(ctx, db.CreateReportParams{
		ID:       rep.ID,
		TenantID: rep.TenantID,
		Slug:     rep.Slug,
		Type:     string(rep.Type),
		Title:    rep.Title,
		Content:  rep.Content,
	}))
}

func (r *ReportRepository) Delete(ctx context.Context, id string) error {
	return mapError(r.queries.DeleteReport(ctx, id))
}

func mapReport(row db.Report) *domain.Report {
	return &domain.Report{
		ID:        row.ID,
		TenantID:  row.TenantID,
		Slug:      row.Slug,
		Type:      domain.ReportType(row.Type),
		Title:     row.Title,
		Content:   row.Content,
		CreatedAt: row.CreatedAt,
	}
}
