package main

import (
	"context"
	"embed"
	"fmt"
	"io/fs"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/getsentry/sentry-go"
	"github.com/go-chi/chi/v5"
	chimw "github.com/go-chi/chi/v5/middleware"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/joho/godotenv"

	"github.com/rush-maestro/rush-maestro/internal/api"
	"github.com/rush-maestro/rush-maestro/internal/config"
	"github.com/rush-maestro/rush-maestro/internal/connector/googleads"
	"github.com/rush-maestro/rush-maestro/internal/connector/llm"
	"github.com/rush-maestro/rush-maestro/internal/connector/media"
	"github.com/rush-maestro/rush-maestro/internal/domain"
	mcpserver "github.com/rush-maestro/rush-maestro/internal/mcp"
	mcpresources "github.com/rush-maestro/rush-maestro/internal/mcp/resources"
	mcptools "github.com/rush-maestro/rush-maestro/internal/mcp/tools"
	"github.com/rush-maestro/rush-maestro/internal/middleware"
	"github.com/rush-maestro/rush-maestro/internal/repository"

	// Register all integration provider schemas.
	_ "github.com/rush-maestro/rush-maestro/internal/connector/email"
	_ "github.com/rush-maestro/rush-maestro/internal/connector/llm"
	_ "github.com/rush-maestro/rush-maestro/internal/connector/meta"
	_ "github.com/rush-maestro/rush-maestro/internal/connector/monitoring"
	_ "github.com/rush-maestro/rush-maestro/internal/connector/storage"
)

//go:embed all:ui/dist
var uiFS embed.FS

func makeAdsFactory(tenantRepo *repository.TenantRepository, integrationRepo *repository.IntegrationRepository, resourceRepo *repository.ConnectorResourceRepository) mcptools.AdsClientFactory {
	return func(ctx context.Context, tenantID string) (*googleads.Client, *domain.Tenant, error) {
		tenant, err := tenantRepo.GetByID(ctx, tenantID)
		if err != nil {
			return nil, nil, fmt.Errorf("tenant %q not found", tenantID)
		}
		resources, err := resourceRepo.List(ctx, tenantID, domain.ProviderGoogleAds, "ad_account")
		if err != nil || len(resources) == 0 {
			return nil, nil, fmt.Errorf("tenant %q has no google_ads ad_account resource", tenantID)
		}
		integration, err := integrationRepo.GetForTenant(ctx, tenantID, "google_ads")
		if err != nil {
			return nil, nil, fmt.Errorf("no connected Google Ads integration for tenant %q", tenantID)
		}
		creds := integration.GoogleAdsCredentials()
		if creds == nil {
			return nil, nil, fmt.Errorf("Google Ads integration for tenant %q is missing credentials", tenantID)
		}
		return googleads.NewClient(resources[0].ResourceID, *creds), tenant, nil
	}
}

func main() {
	_ = godotenv.Load()

	cfg, err := config.Load()
	if err != nil {
		slog.Error("config error", "err", err)
		os.Exit(1)
	}

	// Initialize Sentry if DSN is configured.
	if cfg.SentryDSN != "" {
		err := sentry.Init(sentry.ClientOptions{
			Dsn:              cfg.SentryDSN,
			Environment:      cfg.AppEnv,
			Release:          "rush-maestro@1.0.0",
			TracesSampleRate: 0.2,
		})
		if err != nil {
			slog.Error("sentry init error", "err", err)
		} else {
			slog.Info("sentry initialized")
			defer sentry.Flush(2 * time.Second)
		}
	}

	ctx := context.Background()
	poolCfg, err := pgxpool.ParseConfig(cfg.DatabaseURL)
	if err != nil {
		slog.Error("db config parse error", "err", err)
		os.Exit(1)
	}
	poolCfg.ConnConfig.Tracer = &middleware.QueryCounter{}
	pool, err := pgxpool.NewWithConfig(ctx, poolCfg)
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

	userRepo           := repository.NewUserRepository(pool)
	rbacRepo           := repository.NewRBACRepository(pool)
	tenantRepo         := repository.NewTenantRepository(pool)
	postRepo           := repository.NewPostRepository(pool)
	reportRepo         := repository.NewReportRepository(pool)
	campaignRepo       := repository.NewCampaignRepository(pool)
	alertRepo          := repository.NewAlertRepository(pool)
	agentRunRepo       := repository.NewAgentRunRepository(pool)
	integrationRepo    := repository.NewIntegrationRepository(pool)
	metricsRepo           := repository.NewMetricsRepository(pool)
	connectorResourceRepo := repository.NewConnectorResourceRepository(pool)
	jwtSvc := domain.NewJWTService(cfg.JWTSecret)

	mediaResolver := media.NewLocalResolver(cfg.BaseURL)

	mcpSrv := mcpserver.NewServer("rush-maestro", "1.0.0")
	adsFactory := makeAdsFactory(tenantRepo, integrationRepo, connectorResourceRepo)
	llmSelector := llm.NewProviderSelector(integrationRepo)
	mcptools.RegisterContentTools(mcpSrv, mcptools.ContentRepos{
		Tenants:   tenantRepo,
		Posts:     postRepo,
		Reports:   reportRepo,
		Campaigns: campaignRepo,
		Alerts:    alertRepo,
	})
	mcptools.RegisterAdsTools(mcpSrv, adsFactory)
	mcptools.RegisterLLMTools(mcpSrv, llmSelector)
	mcptools.RegisterMonitoringTools(mcpSrv, mcptools.MonitoringRepos{
		Metrics:    metricsRepo,
		Alerts:     alertRepo,
		AgentRuns:  agentRunRepo,
		AdsFactory: adsFactory,
	})
	mcpresources.RegisterTenantResources(mcpSrv, mcpresources.TenantResourceRepos{
		Tenants: tenantRepo,
		Posts:   postRepo,
		Reports: reportRepo,
	})

	r := chi.NewRouter()
	r.Use(chimw.RealIP)
	r.Use(middleware.SentryHubMiddleware)
	r.Use(middleware.SentryRecovery)
	r.Use(chimw.Recoverer)
	r.Use(chimw.Timeout(30 * time.Second))
	r.Use(middleware.RequestLogger)
	r.Use(middleware.NPlus1Detector)

	r.Get("/health", api.NewHealthHandler(userRepo).Handle)

	r.Post("/setup", api.NewSetupHandler(userRepo, tenantRepo, rbacRepo, jwtSvc, cfg.CookieDomain, cfg.IsProduction()).Create)

	authHandler         := api.NewAuthHandler(userRepo, rbacRepo, jwtSvc, cfg.CookieDomain, cfg.IsProduction())
	usersHandler        := api.NewAdminUsersHandler(userRepo, rbacRepo)
	rolesHandler        := api.NewAdminRolesHandler(rbacRepo)
	tenantsHandler      := api.NewAdminTenantsHandler(tenantRepo, rbacRepo)
	postsHandler        := api.NewAdminPostsHandler(postRepo)
	reportsHandler      := api.NewAdminReportsHandler(reportRepo)
	campaignsHandler    := api.NewAdminCampaignsHandler(campaignRepo)
	alertsHandler       := api.NewAdminAlertsHandler(alertRepo)
	scheduleHandler     := api.NewAdminScheduleHandler(agentRunRepo)
	integrationsHandler := api.NewAdminIntegrationsHandler(integrationRepo)
	oauthGoogleAds      := api.NewOAuthGoogleAdsHandler(integrationRepo, cfg.BaseURL)
	oauthMeta           := api.NewOAuthMetaHandler(integrationRepo, connectorResourceRepo, cfg.BaseURL)
	metaPublish              := api.NewMetaPublishHandler(postRepo, integrationRepo, connectorResourceRepo, mediaResolver)
	connectorResourcesHandler := api.NewConnectorResourcesHandler(connectorResourceRepo)
	mediaHandler        := api.NewMediaHandler(cfg.StoragePath, postRepo)
	aiGenerateHandler   := api.NewAIGenerateHandler(llmSelector)

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
		// Google Ads OAuth — redirect-based flow, no auth middleware
		r.Get("/google-ads/start", oauthGoogleAds.Start)
		r.Get("/google-ads/callback", oauthGoogleAds.Callback)
		// Meta OAuth
		r.Get("/meta/start", oauthMeta.Start)
		r.Get("/meta/callback", oauthMeta.Callback)
	})

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

		// integrations
		r.Get("/integrations", integrationsHandler.List)
		r.Get("/integrations/providers", integrationsHandler.ListProviders)
		r.With(middleware.RequirePermission("manage:integrations")).Post("/integrations", integrationsHandler.Create)
		r.Get("/integrations/{id}", integrationsHandler.Get)
		r.With(middleware.RequirePermission("manage:integrations")).Put("/integrations/{id}", integrationsHandler.Update)
		r.With(middleware.RequirePermission("manage:integrations")).Delete("/integrations/{id}", integrationsHandler.Delete)
		r.Post("/integrations/{id}/test", integrationsHandler.Test)
		r.With(middleware.RequirePermission("manage:integrations")).Put("/integrations/{id}/tenants", integrationsHandler.SetTenants)

		// tenants
		r.With(middleware.RequirePermission("view-any:tenant")).Get("/tenants", tenantsHandler.List)
		r.With(middleware.RequirePermission("create:tenant")).Post("/tenants", tenantsHandler.Create)
		r.Route("/tenants/{tenantId}", func(r chi.Router) {
			r.With(middleware.RequirePermission("view:tenant")).Get("/", tenantsHandler.Get)
			r.With(middleware.RequirePermission("update:tenant")).Put("/", tenantsHandler.Update)
			r.With(middleware.RequirePermission("delete:tenant")).Delete("/", tenantsHandler.Delete)

			// posts
			r.Get("/posts", postsHandler.List)
			r.With(middleware.RequirePermission("create:post")).Post("/posts", postsHandler.Create)
			r.Get("/posts/{id}", postsHandler.Get)
			r.With(middleware.RequirePermission("create:post")).Put("/posts/{id}", postsHandler.Update)
			r.Patch("/posts/{id}/status", postsHandler.UpdateStatus)
			r.With(middleware.RequirePermission("delete:post")).Delete("/posts/{id}", postsHandler.Delete)

			// reports
			r.With(middleware.RequirePermission("view:report")).Get("/reports", reportsHandler.List)
			r.With(middleware.RequirePermission("create:report")).Post("/reports", reportsHandler.Create)
			r.With(middleware.RequirePermission("view:report")).Get("/reports/{slug}", reportsHandler.Get)
			r.With(middleware.RequirePermission("create:report")).Delete("/reports/{id}", reportsHandler.Delete)

			// campaigns
			r.With(middleware.RequirePermission("view:campaign")).Get("/campaigns", campaignsHandler.List)
			r.With(middleware.RequirePermission("manage:campaign")).Post("/campaigns", campaignsHandler.Create)
			r.With(middleware.RequirePermission("view:campaign")).Get("/campaigns/{slug}", campaignsHandler.Get)
			r.With(middleware.RequirePermission("manage:campaign")).Put("/campaigns/{slug}", campaignsHandler.Update)
			r.With(middleware.RequirePermission("manage:campaign")).Delete("/campaigns/{id}", campaignsHandler.Delete)
			r.With(middleware.RequirePermission("manage:campaign")).Post("/campaigns/{id}/deploy", campaignsHandler.Deploy)

			// alerts
			r.Get("/alerts", alertsHandler.List)
			r.Get("/alerts/count", alertsHandler.Count)
			r.Get("/alerts/history", alertsHandler.History)
			r.Post("/alerts/{id}/resolve", alertsHandler.Resolve)
			r.Post("/alerts/{id}/ignore", alertsHandler.Ignore)

			// schedule / agent-runs
			r.Get("/schedule", scheduleHandler.Get)

			// generic connector resources
			r.Get("/connectors", connectorResourcesHandler.List)

			// meta publishing
			r.Get("/meta/accounts", metaPublish.ListAccounts)
			r.With(middleware.RequirePermission("publish:post")).Post("/meta/publish", metaPublish.Publish)
		})
	})

	// Media file serving (public GET) and upload/delete (authenticated)
	r.Get("/api/media/{tenantId}/{filename}", mediaHandler.Serve)
	r.Group(func(r chi.Router) {
		r.Use(middleware.AdminCORS(cfg.AdminCORSOrigins))
		r.Use(middleware.AuthenticateAdmin(jwtSvc))
		r.Post("/api/media/{tenantId}/{postId}", mediaHandler.Upload)
		r.Delete("/api/media/{tenantId}/{postId}", mediaHandler.Delete)
	})

	r.Route("/ai", func(r chi.Router) {
		r.Use(middleware.AdminCORS(cfg.AdminCORSOrigins))
		r.Use(middleware.AuthenticateAdmin(jwtSvc))
		r.Post("/generate", aiGenerateHandler.Generate)
	})

	r.Route("/mcp", func(r chi.Router) {
		r.Use(api.MCPAuthMiddleware(cfg.MCPAPIKey))
		r.Post("/", mcpSrv.ServeHTTP)
		r.Get("/", mcpSrv.ServeHTTP)
		r.Delete("/", mcpSrv.ServeHTTP)
	})

	// Serve SvelteKit SPA — fall back to 200.html for client-side routing
	distFS, err := fs.Sub(uiFS, "ui/dist")
	if err != nil {
		slog.Error("ui/dist embed error", "err", err)
		os.Exit(1)
	}
	fileServer := http.FileServer(http.FS(distFS))
	r.Handle("/*", http.HandlerFunc(func(w http.ResponseWriter, req *http.Request) {
		if _, ferr := distFS.Open(req.URL.Path[1:]); ferr != nil {
			content, rerr := fs.ReadFile(distFS, "200.html")
			if rerr != nil {
				http.NotFound(w, req)
				return
			}
			w.Header().Set("Content-Type", "text/html; charset=utf-8")
			w.WriteHeader(http.StatusOK)
			_, _ = w.Write(content)
			return
		}
		fileServer.ServeHTTP(w, req)
	}))

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
