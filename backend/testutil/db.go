package testutil

import (
	"context"
	"database/sql"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"runtime"
	"testing"
	"time"

	_ "github.com/jackc/pgx/v5/stdlib"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/pressly/goose/v3"
	"github.com/testcontainers/testcontainers-go"
	"github.com/testcontainers/testcontainers-go/modules/postgres"
	"github.com/testcontainers/testcontainers-go/wait"
)

// PostgresContainer wraps a testcontainers Postgres instance.
type PostgresContainer struct {
	Container testcontainers.Container
	DSN       string
	Pool      *pgxpool.Pool
}

// NewPostgresContainer starts a Postgres container, runs migrations, and returns a connection pool.
// Callers should defer Cleanup().
func NewPostgresContainer(t testing.TB) *PostgresContainer {
	ctx := context.Background()

	// Locate migrations directory from project root.
	_, b, _, _ := runtime.Caller(0)
	projectRoot := filepath.Join(filepath.Dir(b), "..")
	migrationsDir := filepath.Join(projectRoot, "migrations")

	container, err := postgres.Run(ctx,
		"postgres:16-alpine",
		postgres.WithDatabase("testdb"),
		postgres.WithUsername("test"),
		postgres.WithPassword("test"),
		testcontainers.WithWaitStrategy(
			wait.ForLog("database system is ready to accept connections").
				WithOccurrence(2).
				WithStartupTimeout(30*time.Second),
		),
	)
	if err != nil {
		t.Fatalf("failed to start postgres container: %v", err)
	}

	host, err := container.Host(ctx)
	if err != nil {
		_ = container.Terminate(ctx)
		t.Fatalf("failed to get container host: %v", err)
	}
	port, err := container.MappedPort(ctx, "5432")
	if err != nil {
		_ = container.Terminate(ctx)
		t.Fatalf("failed to get mapped port: %v", err)
	}

	dsn := fmt.Sprintf("postgres://test:test@%s:%s/testdb?sslmode=disable", host, port.Port())

	// Apply goose migrations.
	db, err := sql.Open("pgx", dsn)
	if err != nil {
		_ = container.Terminate(ctx)
		t.Fatalf("failed to open sql db: %v", err)
	}
	if err := goose.SetDialect("postgres"); err != nil {
		_ = db.Close()
		_ = container.Terminate(ctx)
		t.Fatalf("failed to set goose dialect: %v", err)
	}
	if err := goose.UpContext(ctx, db, migrationsDir); err != nil {
		_ = db.Close()
		_ = container.Terminate(ctx)
		t.Fatalf("failed to run migrations: %v", err)
	}
	_ = db.Close()

	// Create pgx pool for tests.
	pool, err := pgxpool.New(ctx, dsn)
	if err != nil {
		_ = container.Terminate(ctx)
		t.Fatalf("failed to create pgx pool: %v", err)
	}

	pc := &PostgresContainer{
		Container: container,
		DSN:       dsn,
		Pool:      pool,
	}

	t.Cleanup(func() {
		pc.Cleanup(ctx)
	})

	return pc
}

// Cleanup terminates the container and closes the pool.
func (pc *PostgresContainer) Cleanup(ctx context.Context) {
	if pc.Pool != nil {
		pc.Pool.Close()
	}
	if pc.Container != nil {
		if err := pc.Container.Terminate(ctx); err != nil {
			log.Printf("failed to terminate container: %v", err)
		}
	}
}

// ResetDB truncates all tables and restarts identities.
// Use it between sub-tests when you need a clean slate.
func (pc *PostgresContainer) ResetDB(t testing.TB) {
	ctx := context.Background()
	_, err := pc.Pool.Exec(ctx, `
		TRUNCATE TABLE agent_runs, alerts, campaign_drafts, daily_metrics, integrations, posts, reports, tenant_user_roles, user_sessions, users, tenants RESTART IDENTITY CASCADE;
	`)
	if err != nil {
		t.Fatalf("failed to reset db: %v", err)
	}
}

// MustEnv returns an env var or skips the test.
func MustEnv(t testing.TB, key string) string {
	v := os.Getenv(key)
	if v == "" {
		t.Skipf("SKIP: %s not set", key)
	}
	return v
}
