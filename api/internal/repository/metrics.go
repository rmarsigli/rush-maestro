package repository

import (
	"context"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/rush-maestro/rush-maestro/internal/repository/db"
)

type MetricsRepository struct {
	pool    *pgxpool.Pool
	queries *db.Queries
}

func NewMetricsRepository(pool *pgxpool.Pool) *MetricsRepository {
	return &MetricsRepository{pool: pool, queries: db.New(pool)}
}

type DailyMetric struct {
	ID                    string
	TenantID              string
	Date                  time.Time
	CampaignID            string
	CampaignName          string
	Impressions           int32
	Clicks                int32
	CostBRL               float64
	Conversions           float64
	CPABRL                *float64
	CTR                   *float64
	SearchImpressionShare *float64
}

type MonthlySummary struct {
	ID           string
	TenantID     string
	Month        string
	CampaignID   string
	CampaignName string
	Impressions  int32
	Clicks       int32
	CostBRL      float64
	Conversions  float64
	AvgCPABRL    *float64
}

func (r *MetricsRepository) UpsertDaily(ctx context.Context, m DailyMetric) error {
	return mapError(r.queries.UpsertDailyMetrics(ctx, db.UpsertDailyMetricsParams{
		ID:                    m.ID,
		TenantID:              m.TenantID,
		Date:                  timeToDate(m.Date),
		CampaignID:            m.CampaignID,
		CampaignName:          m.CampaignName,
		Impressions:           m.Impressions,
		Clicks:                m.Clicks,
		CostBrl:               floatToNum(m.CostBRL),
		Conversions:           floatToNum(m.Conversions),
		CpaBrl:                floatPtrToNum(m.CPABRL),
		Ctr:                   floatPtrToNum(m.CTR),
		SearchImpressionShare: floatPtrToNum(m.SearchImpressionShare),
	}))
}

func (r *MetricsRepository) GetHistory(ctx context.Context, tenantID string, since time.Time) ([]DailyMetric, error) {
	rows, err := r.queries.GetMetricsHistory(ctx, db.GetMetricsHistoryParams{
		TenantID: tenantID,
		Column2:  timeToDate(since),
	})
	if err != nil {
		return nil, mapError(err)
	}
	metrics := make([]DailyMetric, len(rows))
	for i, row := range rows {
		metrics[i] = DailyMetric{
			ID:                    row.ID,
			TenantID:              row.TenantID,
			Date:                  dateToTime(row.Date),
			CampaignID:            row.CampaignID,
			CampaignName:          row.CampaignName,
			Impressions:           row.Impressions,
			Clicks:                row.Clicks,
			CostBRL:               numToFloat(row.CostBrl),
			Conversions:           numToFloat(row.Conversions),
			CPABRL:                numToFloatPtr(row.CpaBrl),
			CTR:                   numToFloatPtr(row.Ctr),
			SearchImpressionShare: numToFloatPtr(row.SearchImpressionShare),
		}
	}
	return metrics, nil
}

func (r *MetricsRepository) UpsertMonthly(ctx context.Context, m MonthlySummary) error {
	return mapError(r.queries.UpsertMonthlySummary(ctx, db.UpsertMonthlySummaryParams{
		ID:           m.ID,
		TenantID:     m.TenantID,
		Month:        m.Month,
		CampaignID:   m.CampaignID,
		CampaignName: m.CampaignName,
		Impressions:  m.Impressions,
		Clicks:       m.Clicks,
		CostBrl:      floatToNum(m.CostBRL),
		Conversions:  floatToNum(m.Conversions),
		AvgCpaBrl:    floatPtrToNum(m.AvgCPABRL),
	}))
}

func (r *MetricsRepository) GetMonthlySummary(ctx context.Context, tenantID string, limit int) ([]MonthlySummary, error) {
	rows, err := r.queries.GetMonthlySummary(ctx, db.GetMonthlySummaryParams{
		TenantID: tenantID,
		Limit:    int32(limit),
	})
	if err != nil {
		return nil, mapError(err)
	}
	summaries := make([]MonthlySummary, len(rows))
	for i, row := range rows {
		summaries[i] = MonthlySummary{
			ID:           row.ID,
			TenantID:     row.TenantID,
			Month:        row.Month,
			CampaignID:   row.CampaignID,
			CampaignName: row.CampaignName,
			Impressions:  row.Impressions,
			Clicks:       row.Clicks,
			CostBRL:      numToFloat(row.CostBrl),
			Conversions:  numToFloat(row.Conversions),
			AvgCPABRL:    numToFloatPtr(row.AvgCpaBrl),
		}
	}
	return summaries, nil
}
