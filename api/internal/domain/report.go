package domain

import (
	"strings"
	"time"
)

type ReportType string

const (
	ReportTypeAudit   ReportType = "audit"
	ReportTypeSearch  ReportType = "search"
	ReportTypeWeekly  ReportType = "weekly"
	ReportTypeMonthly ReportType = "monthly"
	ReportTypeAlert   ReportType = "alert"
	ReportTypeReport  ReportType = "report"
)

func DetectReportType(slug string) ReportType {
	switch {
	case strings.Contains(slug, "audit"):
		return ReportTypeAudit
	case strings.Contains(slug, "search") || strings.Contains(slug, "campaign"):
		return ReportTypeSearch
	case strings.Contains(slug, "weekly"):
		return ReportTypeWeekly
	case strings.Contains(slug, "monthly") || matchesYYYYMM(slug):
		return ReportTypeMonthly
	case strings.Contains(slug, "alert"):
		return ReportTypeAlert
	default:
		return ReportTypeReport
	}
}

// matchesYYYYMM returns true if the slug ends with a YYYY-MM pattern.
func matchesYYYYMM(slug string) bool {
	if len(slug) < 7 {
		return false
	}
	suffix := slug[len(slug)-7:]
	if suffix[4] != '-' {
		return false
	}
	for _, c := range suffix[:4] {
		if c < '0' || c > '9' {
			return false
		}
	}
	for _, c := range suffix[5:] {
		if c < '0' || c > '9' {
			return false
		}
	}
	return true
}

type Report struct {
	ID        string
	TenantID  string
	Slug      string
	Type      ReportType
	Title     *string
	Content   string
	CreatedAt time.Time
}
