package domain

import (
	"encoding/json"
	"time"
)

type AdsMonitoringConfig struct {
	TargetCPABRL             float64 `json:"target_cpa_brl"`
	NoConversionAlertDays    int     `json:"no_conversion_alert_days"`
	MaxCPAMultiplier         float64 `json:"max_cpa_multiplier"`
	MinDailyImpressions      int     `json:"min_daily_impressions"`
	BudgetUnderpaceThreshold float64 `json:"budget_underpace_threshold"`
}

type Tenant struct {
	ID             string
	Name           string
	Language       string
	Niche          *string
	Location       *string
	PrimaryPersona *string
	Tone           *string
	Instructions   *string
	Hashtags       []string
	GoogleAdsID    *string
	AdsMonitoring  *AdsMonitoringConfig
	CreatedAt      time.Time
	UpdatedAt      time.Time
}

func (t *Tenant) HashtagsJSON() ([]byte, error)      { return json.Marshal(t.Hashtags) }
func (t *Tenant) AdsMonitoringJSON() ([]byte, error) { return json.Marshal(t.AdsMonitoring) }
