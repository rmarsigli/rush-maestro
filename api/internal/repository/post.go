package repository

import (
	"context"
	"encoding/json"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/rush-maestro/rush-maestro/internal/domain"
	"github.com/rush-maestro/rush-maestro/internal/repository/db"
)

type PostRepository struct {
	pool    *pgxpool.Pool
	queries *db.Queries
}

func NewPostRepository(pool *pgxpool.Pool) *PostRepository {
	return &PostRepository{pool: pool, queries: db.New(pool)}
}

func (r *PostRepository) List(ctx context.Context, tenantID string) ([]*domain.Post, error) {
	rows, err := r.queries.ListPosts(ctx, tenantID)
	if err != nil {
		return nil, mapError(err)
	}
	return mapPosts(rows), nil
}

func (r *PostRepository) ListByStatus(ctx context.Context, tenantID, status string) ([]*domain.Post, error) {
	rows, err := r.queries.ListPostsByStatus(ctx, db.ListPostsByStatusParams{
		TenantID: tenantID,
		Status:   status,
	})
	if err != nil {
		return nil, mapError(err)
	}
	return mapPosts(rows), nil
}

func (r *PostRepository) GetByID(ctx context.Context, id string) (*domain.Post, error) {
	row, err := r.queries.GetPostByID(ctx, id)
	if err != nil {
		return nil, mapError(err)
	}
	return mapPost(row), nil
}

func (r *PostRepository) Create(ctx context.Context, p *domain.Post) error {
	hashJSON, _ := json.Marshal(p.Hashtags)
	platJSON, _ := json.Marshal(p.Platforms)
	workJSON, _ := json.Marshal(p.Workflow)
	return mapError(r.queries.CreatePost(ctx, db.CreatePostParams{
		ID:            p.ID,
		TenantID:      p.TenantID,
		Status:        string(p.Status),
		Title:         p.Title,
		Content:       p.Content,
		Hashtags:      hashJSON,
		MediaType:     p.MediaType,
		Workflow:      workJSON,
		MediaPath:     p.MediaPath,
		Platforms:     platJSON,
		ScheduledDate: p.ScheduledDate,
		ScheduledTime: p.ScheduledTime,
	}))
}

func (r *PostRepository) UpdateStatus(ctx context.Context, id, status string, publishedAt interface{}) error {
	return mapError(r.queries.UpdatePostStatus(ctx, db.UpdatePostStatusParams{
		ID:          id,
		Status:      status,
		PublishedAt: timePtrToTS(nil),
	}))
}

func (r *PostRepository) Update(ctx context.Context, p *domain.Post) error {
	hashJSON, _ := json.Marshal(p.Hashtags)
	platJSON, _ := json.Marshal(p.Platforms)
	workJSON, _ := json.Marshal(p.Workflow)
	return mapError(r.queries.UpdatePost(ctx, db.UpdatePostParams{
		ID:            p.ID,
		Title:         p.Title,
		Content:       p.Content,
		Hashtags:      hashJSON,
		MediaType:     p.MediaType,
		Platforms:     platJSON,
		ScheduledDate: p.ScheduledDate,
		ScheduledTime: p.ScheduledTime,
		Workflow:      workJSON,
	}))
}

func (r *PostRepository) Delete(ctx context.Context, id string) error {
	return mapError(r.queries.DeletePost(ctx, id))
}

func mapPosts(rows []db.Post) []*domain.Post {
	posts := make([]*domain.Post, len(rows))
	for i, row := range rows {
		posts[i] = mapPost(row)
	}
	return posts
}

func mapPost(row db.Post) *domain.Post {
	var hashtags []string
	if err := json.Unmarshal(row.Hashtags, &hashtags); err != nil {
		hashtags = []string{}
	}
	var platforms []string
	if err := json.Unmarshal(row.Platforms, &platforms); err != nil {
		platforms = []string{}
	}
	var workflow *domain.PostWorkflow
	if len(row.Workflow) > 0 && string(row.Workflow) != "null" {
		workflow = &domain.PostWorkflow{}
		if err := json.Unmarshal(row.Workflow, workflow); err != nil {
			workflow = nil
		}
	}
	return &domain.Post{
		ID:            row.ID,
		TenantID:      row.TenantID,
		Status:        domain.PostStatus(row.Status),
		Title:         row.Title,
		Content:       row.Content,
		Hashtags:      hashtags,
		MediaType:     row.MediaType,
		Workflow:      workflow,
		MediaPath:     row.MediaPath,
		Platforms:     platforms,
		ScheduledDate: row.ScheduledDate,
		ScheduledTime: row.ScheduledTime,
		PublishedAt:   tsToTimePtr(row.PublishedAt),
		CreatedAt:     row.CreatedAt,
		UpdatedAt:     row.UpdatedAt,
	}
}
