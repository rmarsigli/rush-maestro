package repository

import (
	"context"
	"testing"

	"github.com/rush-maestro/rush-maestro/internal/domain"
	"github.com/rush-maestro/rush-maestro/testutil"
)

func TestPostRepository_CreateAndGet(t *testing.T) {
	ctx := context.Background()
	container := testutil.NewPostgresContainer(t)
	repo := NewPostRepository(container.Pool)

	testutil.MustCreateTenant(ctx, t, container.Pool, "tenant-post", "Post Tenant")

	post := testutil.NewTestPost("post-1", "tenant-post", "Hello world")
	post.Title = testutil.Ptr("My Title")
	post.MediaType = testutil.Ptr("image")
	post.Hashtags = []string{"#test"}
	post.Platforms = []string{"instagram"}

	if err := repo.Create(ctx, post); err != nil {
		t.Fatalf("create post: %v", err)
	}

	got, err := repo.GetByID(ctx, "post-1")
	if err != nil {
		t.Fatalf("get post: %v", err)
	}
	if got.Content != "Hello world" {
		t.Errorf("content = %q, want %q", got.Content, "Hello world")
	}
	if got.Title == nil || *got.Title != "My Title" {
		t.Errorf("title mismatch")
	}
	if len(got.Hashtags) != 1 || got.Hashtags[0] != "#test" {
		t.Errorf("hashtags = %v, want [#test]", got.Hashtags)
	}
}

func TestPostRepository_ListByStatus(t *testing.T) {
	ctx := context.Background()
	container := testutil.NewPostgresContainer(t)
	repo := NewPostRepository(container.Pool)

	testutil.MustCreateTenant(ctx, t, container.Pool, "tenant-post2", "Post Tenant 2")
	testutil.MustCreatePost(ctx, t, container.Pool, "p1", "tenant-post2", "draft content", string(domain.PostStatusDraft))
	testutil.MustCreatePost(ctx, t, container.Pool, "p2", "tenant-post2", "approved content", string(domain.PostStatusApproved))

	list, err := repo.ListByStatus(ctx, "tenant-post2", string(domain.PostStatusDraft))
	if err != nil {
		t.Fatalf("list by status: %v", err)
	}
	if len(list) != 1 {
		t.Errorf("len(list) = %d, want 1", len(list))
	}
}

func TestPostRepository_UpdateAndDelete(t *testing.T) {
	ctx := context.Background()
	container := testutil.NewPostgresContainer(t)
	repo := NewPostRepository(container.Pool)

	testutil.MustCreateTenant(ctx, t, container.Pool, "tenant-post3", "Post Tenant 3")
	post := testutil.NewTestPost("post-3", "tenant-post3", "original")
	if err := repo.Create(ctx, post); err != nil {
		t.Fatalf("create: %v", err)
	}

	post.Content = "updated"
	if err := repo.Update(ctx, post); err != nil {
		t.Fatalf("update: %v", err)
	}

	got, err := repo.GetByID(ctx, "post-3")
	if err != nil {
		t.Fatalf("get after update: %v", err)
	}
	if got.Content != "updated" {
		t.Errorf("content = %q, want %q", got.Content, "updated")
	}

	if err := repo.Delete(ctx, "post-3"); err != nil {
		t.Fatalf("delete: %v", err)
	}

	_, err = repo.GetByID(ctx, "post-3")
	if err == nil {
		t.Error("expected error after delete, got nil")
	}
}
