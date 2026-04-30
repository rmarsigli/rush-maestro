package repository

import (
	"context"
	"testing"

	"github.com/rush-maestro/rush-maestro/internal/domain"
	"github.com/rush-maestro/rush-maestro/testutil"
)

func TestIntegrationRepository_CreateAndGet(t *testing.T) {
	ctx := context.Background()
	container := testutil.NewPostgresContainer(t)
	repo := NewIntegrationRepository(container.Pool)

	ig := testutil.NewTestIntegration("ig-1", "Google Ads", domain.ProviderGoogleAds)
	if err := repo.Create(ctx, ig); err != nil {
		t.Fatalf("create integration: %v", err)
	}

	got, err := repo.GetByID(ctx, "ig-1")
	if err != nil {
		t.Fatalf("get by id: %v", err)
	}
	if got.Name != "Google Ads" {
		t.Errorf("name = %q, want %q", got.Name, "Google Ads")
	}
	if got.Provider != domain.ProviderGoogleAds {
		t.Errorf("provider = %q, want %q", got.Provider, domain.ProviderGoogleAds)
	}
}

func TestIntegrationRepository_List(t *testing.T) {
	ctx := context.Background()
	container := testutil.NewPostgresContainer(t)
	repo := NewIntegrationRepository(container.Pool)

	testutil.MustCreateIntegration(ctx, t, container.Pool, "ig-2", "Meta", "meta", "social_media", "pending")
	testutil.MustCreateIntegration(ctx, t, container.Pool, "ig-3", "S3", "s3", "media", "pending")

	list, err := repo.List(ctx)
	if err != nil {
		t.Fatalf("list: %v", err)
	}
	if len(list) < 2 {
		t.Errorf("len(list) = %d, want >= 2", len(list))
	}
}

func TestIntegrationRepository_SetTenants(t *testing.T) {
	ctx := context.Background()
	container := testutil.NewPostgresContainer(t)
	repo := NewIntegrationRepository(container.Pool)

	testutil.MustCreateTenant(ctx, t, container.Pool, "tenant-ig", "Integration Tenant")
	testutil.MustCreateIntegration(ctx, t, container.Pool, "ig-4", "Claude", "claude", "llm", "pending")

	if err := repo.SetTenants(ctx, "ig-4", []string{"tenant-ig"}); err != nil {
		t.Fatalf("set tenants: %v", err)
	}

	got, err := repo.GetByID(ctx, "ig-4")
	if err != nil {
		t.Fatalf("get by id after set tenants: %v", err)
	}
	if len(got.TenantIDs) != 1 || got.TenantIDs[0] != "tenant-ig" {
		t.Errorf("tenantIDs = %v, want [tenant-ig]", got.TenantIDs)
	}
}

func TestIntegrationRepository_UpdateAndDelete(t *testing.T) {
	ctx := context.Background()
	container := testutil.NewPostgresContainer(t)
	repo := NewIntegrationRepository(container.Pool)

	ig := testutil.NewTestIntegration("ig-5", "OpenAI", domain.ProviderOpenAI)
	if err := repo.Create(ctx, ig); err != nil {
		t.Fatalf("create: %v", err)
	}

	ig.Name = "OpenAI Updated"
	ig.Status = domain.StatusConnected
	if err := repo.Update(ctx, ig); err != nil {
		t.Fatalf("update: %v", err)
	}

	got, err := repo.GetByID(ctx, "ig-5")
	if err != nil {
		t.Fatalf("get after update: %v", err)
	}
	if got.Name != "OpenAI Updated" {
		t.Errorf("name = %q, want %q", got.Name, "OpenAI Updated")
	}
	if got.Status != domain.StatusConnected {
		t.Errorf("status = %q, want %q", got.Status, domain.StatusConnected)
	}

	if err := repo.Delete(ctx, "ig-5"); err != nil {
		t.Fatalf("delete: %v", err)
	}

	_, err = repo.GetByID(ctx, "ig-5")
	if err == nil {
		t.Error("expected error after delete, got nil")
	}
}
