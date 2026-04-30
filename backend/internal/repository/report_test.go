package repository

import (
	"context"
	"testing"

	"github.com/rush-maestro/rush-maestro/testutil"
)

func TestReportRepository_CreateAndGet(t *testing.T) {
	ctx := context.Background()
	container := testutil.NewPostgresContainer(t)
	repo := NewReportRepository(container.Pool)

	testutil.MustCreateTenant(ctx, t, container.Pool, "tenant-report", "Report Tenant")

	report := testutil.NewTestReport("report-1", "tenant-report", "weekly-2024-01")
	report.Title = testutil.Ptr("Weekly Report")
	if err := repo.Create(ctx, report); err != nil {
		t.Fatalf("create report: %v", err)
	}

	got, err := repo.GetBySlug(ctx, "tenant-report", "weekly-2024-01")
	if err != nil {
		t.Fatalf("get by slug: %v", err)
	}
	if got.Slug != "weekly-2024-01" {
		t.Errorf("slug = %q, want %q", got.Slug, "weekly-2024-01")
	}
	if got.Title == nil || *got.Title != "Weekly Report" {
		t.Errorf("title mismatch")
	}
}

func TestReportRepository_List(t *testing.T) {
	ctx := context.Background()
	container := testutil.NewPostgresContainer(t)
	repo := NewReportRepository(container.Pool)

	testutil.MustCreateTenant(ctx, t, container.Pool, "tenant-report2", "Report Tenant 2")
	testutil.MustCreateReport(ctx, t, container.Pool, "r1", "tenant-report2", "slug-a", "weekly", "A", "content-a")
	testutil.MustCreateReport(ctx, t, container.Pool, "r2", "tenant-report2", "slug-b", "monthly", "B", "content-b")

	list, err := repo.List(ctx, "tenant-report2")
	if err != nil {
		t.Fatalf("list: %v", err)
	}
	if len(list) != 2 {
		t.Errorf("len(list) = %d, want 2", len(list))
	}
}

func TestReportRepository_GetByIDAndDelete(t *testing.T) {
	ctx := context.Background()
	container := testutil.NewPostgresContainer(t)
	repo := NewReportRepository(container.Pool)

	testutil.MustCreateTenant(ctx, t, container.Pool, "tenant-report3", "Report Tenant 3")
	report := testutil.NewTestReport("report-3", "tenant-report3", "slug-c")
	if err := repo.Create(ctx, report); err != nil {
		t.Fatalf("create: %v", err)
	}

	got, err := repo.GetByID(ctx, "report-3")
	if err != nil {
		t.Fatalf("get by id: %v", err)
	}
	if got.ID != "report-3" {
		t.Errorf("id = %q, want %q", got.ID, "report-3")
	}

	if err := repo.Delete(ctx, "report-3"); err != nil {
		t.Fatalf("delete: %v", err)
	}

	_, err = repo.GetByID(ctx, "report-3")
	if err == nil {
		t.Error("expected error after delete, got nil")
	}
}
