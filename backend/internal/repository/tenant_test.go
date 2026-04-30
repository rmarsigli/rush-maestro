package repository

import (
	"context"
	"testing"

	"github.com/rush-maestro/rush-maestro/internal/domain"
	"github.com/rush-maestro/rush-maestro/testutil"
)

func TestTenantRepository_CreateAndGet(t *testing.T) {
	ctx := context.Background()
	container := testutil.NewPostgresContainer(t)
	repo := NewTenantRepository(container.Pool)

	tenant := &domain.Tenant{
		ID:   "tenant-1",
		Name: "Test Tenant",
	}

	if err := repo.Create(ctx, tenant); err != nil {
		t.Fatalf("create tenant: %v", err)
	}

	got, err := repo.GetByID(ctx, "tenant-1")
	if err != nil {
		t.Fatalf("get tenant: %v", err)
	}
	if got.Name != "Test Tenant" {
		t.Errorf("name = %q, want %q", got.Name, "Test Tenant")
	}
}

func TestTenantRepository_List(t *testing.T) {
	ctx := context.Background()
	container := testutil.NewPostgresContainer(t)
	repo := NewTenantRepository(container.Pool)

	for _, id := range []string{"a", "b", "c"} {
		if err := repo.Create(ctx, &domain.Tenant{ID: id, Name: id}); err != nil {
			t.Fatalf("create tenant %s: %v", id, err)
		}
	}

	list, err := repo.List(ctx)
	if err != nil {
		t.Fatalf("list tenants: %v", err)
	}
	if len(list) != 3 {
		t.Errorf("len(list) = %d, want 3", len(list))
	}
}

func TestTenantRepository_ResetDB(t *testing.T) {
	ctx := context.Background()
	container := testutil.NewPostgresContainer(t)
	repo := NewTenantRepository(container.Pool)

	if err := repo.Create(ctx, &domain.Tenant{ID: "x", Name: "x"}); err != nil {
		t.Fatalf("create: %v", err)
	}

	container.ResetDB(t)

	_, err := repo.GetByID(ctx, "x")
	if err == nil {
		t.Error("expected error after reset, got nil")
	}
}
