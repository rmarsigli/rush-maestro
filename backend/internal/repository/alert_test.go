package repository

import (
	"context"
	"testing"

	"github.com/rush-maestro/rush-maestro/testutil"
)

func TestAlertRepository_CreateAndListOpen(t *testing.T) {
	ctx := context.Background()
	container := testutil.NewPostgresContainer(t)
	repo := NewAlertRepository(container.Pool)

	testutil.MustCreateTenant(ctx, t, container.Pool, "tenant-alert", "Alert Tenant")
	testutil.MustCreateAlert(ctx, t, container.Pool, "alert-1", "tenant-alert", "WARN", "budget", "over budget")

	list, err := repo.ListOpen(ctx, "tenant-alert")
	if err != nil {
		t.Fatalf("list open: %v", err)
	}
	if len(list) != 1 {
		t.Errorf("len(list) = %d, want 1", len(list))
	}
	if list[0].Message != "over budget" {
		t.Errorf("message = %q, want %q", list[0].Message, "over budget")
	}
}

func TestAlertRepository_CountOpen(t *testing.T) {
	ctx := context.Background()
	container := testutil.NewPostgresContainer(t)
	repo := NewAlertRepository(container.Pool)

	testutil.MustCreateTenant(ctx, t, container.Pool, "tenant-alert2", "Alert Tenant 2")
	testutil.MustCreateAlert(ctx, t, container.Pool, "alert-2", "tenant-alert2", "CRITICAL", "cpa", "too high")

	count, err := repo.CountOpen(ctx, "tenant-alert2")
	if err != nil {
		t.Fatalf("count open: %v", err)
	}
	if count != 1 {
		t.Errorf("count = %d, want 1", count)
	}
}

func TestAlertRepository_ResolveAndIgnore(t *testing.T) {
	ctx := context.Background()
	container := testutil.NewPostgresContainer(t)
	repo := NewAlertRepository(container.Pool)

	testutil.MustCreateTenant(ctx, t, container.Pool, "tenant-alert3", "Alert Tenant 3")
	testutil.MustCreateAlert(ctx, t, container.Pool, "alert-3", "tenant-alert3", "WARN", "budget", "msg")

	if err := repo.Resolve(ctx, "alert-3"); err != nil {
		t.Fatalf("resolve: %v", err)
	}

	open, err := repo.ListOpen(ctx, "tenant-alert3")
	if err != nil {
		t.Fatalf("list open after resolve: %v", err)
	}
	if len(open) != 0 {
		t.Errorf("len(open) = %d, want 0", len(open))
	}

	history, err := repo.ListHistory(ctx, "tenant-alert3", 10)
	if err != nil {
		t.Fatalf("list history: %v", err)
	}
	if len(history) != 1 {
		t.Errorf("len(history) = %d, want 1", len(history))
	}
}
