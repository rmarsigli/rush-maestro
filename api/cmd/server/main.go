package main

import (
	"context"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/go-chi/chi/v5"
	chimw "github.com/go-chi/chi/v5/middleware"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/joho/godotenv"

	"github.com/rush-maestro/rush-maestro/internal/api"
	"github.com/rush-maestro/rush-maestro/internal/config"
	"github.com/rush-maestro/rush-maestro/internal/domain"
	"github.com/rush-maestro/rush-maestro/internal/middleware"
	"github.com/rush-maestro/rush-maestro/internal/repository"
)

func main() {
	_ = godotenv.Load()

	cfg, err := config.Load()
	if err != nil {
		slog.Error("config error", "err", err)
		os.Exit(1)
	}

	ctx := context.Background()
	pool, err := pgxpool.New(ctx, cfg.DatabaseURL)
	if err != nil {
		slog.Error("db connect error", "err", err)
		os.Exit(1)
	}
	defer pool.Close()

	if err := pool.Ping(ctx); err != nil {
		slog.Error("db ping error", "err", err)
		os.Exit(1)
	}
	slog.Info("database connected")

	userRepo := repository.NewUserRepository(pool)
	rbacRepo := repository.NewRBACRepository(pool)
	jwtSvc := domain.NewJWTService(cfg.JWTSecret)

	r := chi.NewRouter()
	r.Use(chimw.RealIP)
	r.Use(chimw.Recoverer)
	r.Use(chimw.Timeout(30 * time.Second))
	r.Use(middleware.RequestLogger)

	r.Get("/health", api.NewHealthHandler(userRepo).Handle)

	r.Post("/setup", api.NewSetupHandler(userRepo).Create)

	authHandler := api.NewAuthHandler(
		userRepo, rbacRepo, jwtSvc,
		cfg.CookieDomain, cfg.IsProduction(),
	)
	r.Route("/auth", func(r chi.Router) {
		r.Use(middleware.AdminCORS(cfg.AdminCORSOrigins))
		r.Post("/login", authHandler.Login)
		r.Post("/refresh", authHandler.Refresh)
		r.Post("/logout", authHandler.Logout)
		r.Group(func(r chi.Router) {
			r.Use(middleware.AuthenticateAdmin(jwtSvc))
			r.Get("/me", authHandler.Me)
			r.Put("/me", authHandler.UpdateMe)
			r.Post("/change-password", authHandler.ChangePassword)
		})
	})

	usersHandler := api.NewAdminUsersHandler(userRepo, rbacRepo)
	rolesHandler := api.NewAdminRolesHandler(rbacRepo)

	r.Route("/admin", func(r chi.Router) {
		r.Use(middleware.AdminCORS(cfg.AdminCORSOrigins))
		r.Use(middleware.AuthenticateAdmin(jwtSvc))

		r.With(middleware.RequirePermission("view-any:user")).Get("/users", usersHandler.List)
		r.With(middleware.RequirePermission("create:user")).Post("/users", usersHandler.Create)
		r.With(middleware.RequirePermission("view:user")).Get("/users/{id}", usersHandler.Get)
		r.With(middleware.RequirePermission("update:user")).Put("/users/{id}", usersHandler.Update)
		r.With(middleware.RequirePermission("delete:user")).Delete("/users/{id}", usersHandler.Delete)
		r.With(middleware.RequirePermission("update:user")).Put("/users/{id}/role", usersHandler.AssignRole)

		r.With(middleware.RequirePermission("view-any:role")).Get("/roles", rolesHandler.List)
		r.With(middleware.RequirePermission("create:role")).Post("/roles", rolesHandler.Create)
		r.With(middleware.RequirePermission("view:role")).Get("/roles/{id}", rolesHandler.Get)
		r.With(middleware.RequirePermission("update:role")).Put("/roles/{id}/permissions", rolesHandler.SetPermissions)
		r.With(middleware.RequirePermission("delete:role")).Delete("/roles/{id}", rolesHandler.Delete)
		r.With(middleware.RequirePermission("view:role")).Get("/permissions", rolesHandler.ListPermissions)
	})

	srv := &http.Server{
		Addr:         ":" + cfg.Port,
		Handler:      r,
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 30 * time.Second,
		IdleTimeout:  60 * time.Second,
	}

	go func() {
		slog.Info("server starting", "port", cfg.Port)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			slog.Error("server error", "err", err)
			os.Exit(1)
		}
	}()

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	slog.Info("shutting down...")
	shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := srv.Shutdown(shutdownCtx); err != nil {
		slog.Error("shutdown error", "err", err)
	}
	fmt.Println("bye")
}
