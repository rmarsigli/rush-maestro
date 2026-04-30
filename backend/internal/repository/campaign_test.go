package repository

import (
	"context"
	"encoding/json"
	"testing"

	"github.com/rush-maestro/rush-maestro/testutil"
)

func TestCampaignRepository_UpsertAndGet(t *testing.T) {
	ctx := context.Background()
	container := testutil.NewPostgresContainer(t)
	repo := NewCampaignRepository(container.Pool)

	testutil.MustCreateTenant(ctx, t, container.Pool, "tenant-camp", "Campaign Tenant")

	data := json.RawMessage(`{"budget":100}`)
	if err := repo.Upsert(ctx, "camp-1", "tenant-camp", "summer-sale", data); err != nil {
		t.Fatalf("upsert campaign: %v", err)
	}

	got, err := repo.GetBySlug(ctx, "tenant-camp", "summer-sale")
	if err != nil {
		t.Fatalf("get by slug: %v", err)
	}
	if got.Slug != "summer-sale" {
		t.Errorf("slug = %q, want %q", got.Slug, "summer-sale")
	}
	if string(got.Data) != `{"budget":100}` {
		t.Errorf("data = %s, want %s", got.Data, `{"budget":100}`)
	}
}

func TestCampaignRepository_List(t *testing.T) {
	ctx := context.Background()
	container := testutil.NewPostgresContainer(t)
	repo := NewCampaignRepository(container.Pool)

	testutil.MustCreateTenant(ctx, t, container.Pool, "tenant-camp2", "Campaign Tenant 2")
	testutil.MustCreateCampaign(ctx, t, container.Pool, "c1", "tenant-camp2", "slug-a", nil)
	testutil.MustCreateCampaign(ctx, t, container.Pool, "c2", "tenant-camp2", "slug-b", nil)

	list, err := repo.List(ctx, "tenant-camp2")
	if err != nil {
		t.Fatalf("list: %v", err)
	}
	if len(list) != 2 {
		t.Errorf("len(list) = %d, want 2", len(list))
	}
}

func TestCampaignRepository_MarkDeployedAndDelete(t *testing.T) {
	ctx := context.Background()
	container := testutil.NewPostgresContainer(t)
	repo := NewCampaignRepository(container.Pool)

	testutil.MustCreateTenant(ctx, t, container.Pool, "tenant-camp3", "Campaign Tenant 3")
	testutil.MustCreateCampaign(ctx, t, container.Pool, "c3", "tenant-camp3", "slug-c", nil)

	if err := repo.MarkDeployed(ctx, "c3"); err != nil {
		t.Fatalf("mark deployed: %v", err)
	}

	if err := repo.Delete(ctx, "c3"); err != nil {
		t.Fatalf("delete: %v", err)
	}

	_, err := repo.GetBySlug(ctx, "tenant-camp3", "slug-c")
	if err == nil {
		t.Error("expected error after delete, got nil")
	}
}
