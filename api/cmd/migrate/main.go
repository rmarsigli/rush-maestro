package main

import (
	"context"
	"database/sql"
	"log/slog"
	"os"

	_ "github.com/jackc/pgx/v5/stdlib"
	"github.com/joho/godotenv"
	"github.com/pressly/goose/v3"
)

func main() {
	_ = godotenv.Load()

	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		slog.Error("DATABASE_URL is required")
		os.Exit(1)
	}

	db, err := sql.Open("pgx", dbURL)
	if err != nil {
		slog.Error("db open error", "err", err)
		os.Exit(1)
	}
	defer db.Close()

	if err := goose.SetDialect("postgres"); err != nil {
		slog.Error("goose dialect error", "err", err)
		os.Exit(1)
	}

	args := os.Args[1:]
	cmd := "up"
	if len(args) > 0 {
		cmd = args[0]
	}

	ctx := context.Background()
	var runErr error
	switch cmd {
	case "up":
		runErr = goose.UpContext(ctx, db, "migrations", goose.WithAllowMissing())
	case "down":
		runErr = goose.Down(db, "migrations")
	case "status":
		runErr = goose.Status(db, "migrations")
	default:
		runErr = goose.RunContext(ctx, cmd, db, "migrations")
	}

	if runErr != nil {
		slog.Error("migration error", "err", runErr)
		os.Exit(1)
	}
}
