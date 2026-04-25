package repository

import (
	"context"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/rush-maestro/rush-maestro/internal/domain"
	"github.com/rush-maestro/rush-maestro/internal/repository/db"
)

type UserRepository struct {
	pool    *pgxpool.Pool
	queries *db.Queries
}

func NewUserRepository(pool *pgxpool.Pool) *UserRepository {
	return &UserRepository{pool: pool, queries: db.New(pool)}
}

func (r *UserRepository) GetByEmail(ctx context.Context, email string) (*domain.User, error) {
	row, err := r.queries.GetUserByEmail(ctx, email)
	if err != nil {
		return nil, mapError(err)
	}
	return mapUser(row), nil
}

func (r *UserRepository) GetByID(ctx context.Context, id string) (*domain.User, error) {
	row, err := r.queries.GetUserByID(ctx, id)
	if err != nil {
		return nil, mapError(err)
	}
	return mapUser(row), nil
}

func (r *UserRepository) List(ctx context.Context) ([]*domain.User, error) {
	rows, err := r.queries.ListUsers(ctx)
	if err != nil {
		return nil, mapError(err)
	}
	users := make([]*domain.User, len(rows))
	for i, row := range rows {
		users[i] = mapUser(row)
	}
	return users, nil
}

func (r *UserRepository) Create(ctx context.Context, u *domain.User) error {
	return mapError(r.queries.CreateUser(ctx, db.CreateUserParams{
		ID:           u.ID,
		Name:         u.Name,
		Email:        u.Email,
		PasswordHash: u.PasswordHash,
		Locale:       u.Locale,
		Timezone:     u.Timezone,
		IsActive:     u.IsActive,
	}))
}

func (r *UserRepository) Update(ctx context.Context, u *domain.User) error {
	return mapError(r.queries.UpdateUser(ctx, db.UpdateUserParams{
		ID:       u.ID,
		Name:     u.Name,
		Email:    u.Email,
		Locale:   u.Locale,
		Timezone: u.Timezone,
		IsActive: u.IsActive,
	}))
}

func (r *UserRepository) UpdatePasswordHash(ctx context.Context, id, hash string) error {
	return mapError(r.queries.UpdateUserPassword(ctx, db.UpdateUserPasswordParams{
		ID:           id,
		PasswordHash: hash,
	}))
}

func (r *UserRepository) Delete(ctx context.Context, id string) error {
	return mapError(r.queries.DeleteUser(ctx, id))
}

func (r *UserRepository) Count(ctx context.Context) (int64, error) {
	return r.queries.CountUsers(ctx)
}

func mapUser(row db.User) *domain.User {
	return &domain.User{
		ID:           row.ID,
		Name:         row.Name,
		Email:        row.Email,
		PasswordHash: row.PasswordHash,
		Locale:       row.Locale,
		Timezone:     row.Timezone,
		IsActive:     row.IsActive,
		CreatedAt:    row.CreatedAt,
		UpdatedAt:    row.UpdatedAt,
	}
}
