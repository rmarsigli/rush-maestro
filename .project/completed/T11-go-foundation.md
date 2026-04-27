# T11 — Fundação Go: módulo, estrutura, Docker, Makefile, health route

**Status:** pending  
**Fase:** 0 — Fundação (bloqueante para tudo)  
**Estimativa:** 4–6 horas  
**Depende de:** nada  
**Desbloqueia:** T12 (Auth), T13 (Migração de dados), T14 (API REST)

---

## Contexto

Rush Maestro está migrando de SvelteKit + SQLite + Bun para Go API + PostgreSQL + SvelteKit SPA.
Esta task cria o esqueleto completo do projeto Go. Nenhuma lógica de negócio ainda — só a infraestrutura
que todas as tasks seguintes vão usar.

Existe um projeto Go de referência em `/home/rafhael/www/html/rush-cms/rush-cms-v2/backend/` que usa
o mesmo stack (chi, pgx, goose, sqlc). Copiar arquivos utilitários dele onde indicado — não reescrever.

O projeto Go viverá dentro do repositório atual em `/home/rafhael/www/html/marketing/api/`.
O SvelteKit continua em `/home/rafhael/www/html/marketing/` (raiz) durante a transição.

---

## Estrutura alvo desta task

```
/home/rafhael/www/html/marketing/
  api/                          ← NOVO — tudo desta task vive aqui
    cmd/
      server/
        main.go
      migrate/
        main.go
    internal/
      api/
        health.go
        respond.go
      domain/
        errors.go
        id.go
      middleware/
        cors.go
        logging.go
      config/
        config.go
    migrations/
      000001_extensions.sql
    go.mod
    go.sum
    sqlc.yaml
    Makefile
    .env
    .env.example
    .air.toml
  docker-compose.yml            ← NOVO na raiz do projeto
  docker-compose.dev.yml        ← NOVO na raiz do projeto
```

---

## Passo 1 — Criar módulo Go

```bash
mkdir -p /home/rafhael/www/html/marketing/api
cd /home/rafhael/www/html/marketing/api
go mod init github.com/rush-maestro/rush-maestro
```

**go.mod resultado esperado:**
```
module github.com/rush-maestro/rush-maestro

go 1.24
```

Instalar dependências diretas:
```bash
go get github.com/go-chi/chi/v5@latest
go get github.com/jackc/pgx/v5@latest
go get github.com/pressly/goose/v3@latest
go get github.com/joho/godotenv@latest
go get github.com/golang-jwt/jwt/v5@latest
go get golang.org/x/crypto@latest
go get github.com/oklog/ulid/v2@latest
```

Dependências de teste (instalar com `-t`):
```bash
go get github.com/testcontainers/testcontainers-go@latest
go get github.com/testcontainers/testcontainers-go/modules/postgres@latest
go get github.com/stretchr/testify@latest
```

---

## Passo 2 — Criar estrutura de diretórios

```bash
cd /home/rafhael/www/html/marketing/api
mkdir -p cmd/server cmd/migrate
mkdir -p internal/api internal/domain internal/middleware internal/config
mkdir -p internal/repository/db internal/repository/queries
mkdir -p migrations
mkdir -p testutil
```

---

## Passo 3 — Copiar utilitários do rush-cms-v2

Copiar sem modificar (são utilitários genéricos, não têm dependência de domínio do CMS):

```bash
V2=/home/rafhael/www/html/rush-cms/rush-cms-v2/backend

cp "$V2/internal/domain/id.go"     ./internal/domain/id.go
cp "$V2/internal/domain/errors.go" ./internal/domain/errors.go
cp "$V2/internal/api/respond.go"   ./internal/api/respond.go
```

Após copiar, **ajustar o package name** em cada arquivo se necessário:
- `id.go`: `package domain` — verificar se usa `github.com/oklog/ulid/v2`, ajustar import se o path mudou
- `errors.go`: `package domain` — verificar se há imports do rush-cms que precisam ser removidos
- `respond.go`: `package api` — verificar imports

Verificar rapidamente:
```bash
grep "^package\|^import\|rush-cms" internal/domain/id.go internal/domain/errors.go internal/api/respond.go
```

Se aparecer `rush-cms` em algum import, substituir por `rush-maestro`.

---

## Passo 4 — Config

Criar `internal/config/config.go`:

```go
package config

import (
	"fmt"
	"os"
)

type Config struct {
	Port             string
	DatabaseURL      string
	JWTSecret        string
	AdminCORSOrigins string
	CookieDomain     string
	AppEnv           string
}

func Load() (*Config, error) {
	cfg := &Config{
		Port:             getEnv("PORT", "8080"),
		DatabaseURL:      os.Getenv("DATABASE_URL"),
		JWTSecret:        os.Getenv("JWT_SECRET"),
		AdminCORSOrigins: getEnv("ADMIN_CORS_ORIGINS", "http://localhost:5173"),
		CookieDomain:     os.Getenv("COOKIE_DOMAIN"),
		AppEnv:           getEnv("APP_ENV", "development"),
	}

	if cfg.DatabaseURL == "" {
		return nil, fmt.Errorf("DATABASE_URL is required")
	}
	if cfg.JWTSecret == "" {
		return nil, fmt.Errorf("JWT_SECRET is required")
	}
	if len(cfg.JWTSecret) < 32 {
		return nil, fmt.Errorf("JWT_SECRET must be at least 32 characters")
	}

	return cfg, nil
}

func (c *Config) IsProduction() bool {
	return c.AppEnv == "production"
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
```

---

## Passo 5 — Health handler

Criar `internal/api/health.go`:

```go
package api

import (
	"encoding/json"
	"net/http"
)

type HealthHandler struct {
	SetupRequired func() bool
}

func (h *HealthHandler) Handle(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]any{
		"status":         "ok",
		"setup_required": h.SetupRequired(),
	})
}
```

`SetupRequired` será injetado pelo main.go como uma função que consulta o banco.
Por ora, pode retornar `false` hardcoded até a task de auth implementar a verificação real.

---

## Passo 6 — Middleware básico

Criar `internal/middleware/cors.go`:

```go
package middleware

import (
	"net/http"
	"strings"
)

func AdminCORS(allowedOrigins string) func(http.Handler) http.Handler {
	origins := strings.Split(allowedOrigins, ",")
	originSet := make(map[string]bool, len(origins))
	for _, o := range origins {
		originSet[strings.TrimSpace(o)] = true
	}

	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			origin := r.Header.Get("Origin")
			if originSet[origin] {
				w.Header().Set("Access-Control-Allow-Origin", origin)
				w.Header().Set("Access-Control-Allow-Credentials", "true")
				w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS")
				w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
				w.Header().Set("Vary", "Origin")
			}
			if r.Method == http.MethodOptions {
				w.WriteHeader(http.StatusNoContent)
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}
```

Criar `internal/middleware/logging.go`:

```go
package middleware

import (
	"log/slog"
	"net/http"
	"time"
)

func RequestLogger(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		wrapped := &responseWriter{ResponseWriter: w, status: http.StatusOK}
		next.ServeHTTP(wrapped, r)
		slog.Info("request",
			"method", r.Method,
			"path", r.URL.Path,
			"status", wrapped.status,
			"duration_ms", time.Since(start).Milliseconds(),
		)
	})
}

type responseWriter struct {
	http.ResponseWriter
	status int
}

func (rw *responseWriter) WriteHeader(code int) {
	rw.status = code
	rw.ResponseWriter.WriteHeader(code)
}
```

---

## Passo 7 — cmd/server/main.go

```go
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
	"github.com/rush-maestro/rush-maestro/internal/middleware"
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

	r := chi.NewRouter()
	r.Use(chimw.RealIP)
	r.Use(chimw.Recoverer)
	r.Use(chimw.Timeout(30 * time.Second))
	r.Use(middleware.RequestLogger)

	healthHandler := &api.HealthHandler{
		SetupRequired: func() bool { return false }, // substituir na T12
	}
	r.Get("/health", healthHandler.Handle)

	r.Route("/admin", func(r chi.Router) {
		r.Use(middleware.AdminCORS(cfg.AdminCORSOrigins))
		// handlers serão registrados nas tasks seguintes
		r.Get("/", func(w http.ResponseWriter, r *http.Request) {
			w.WriteHeader(http.StatusOK)
		})
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
```

---

## Passo 8 — cmd/migrate/main.go

```go
package main

import (
	"context"
	"database/sql"
	"log/slog"
	"os"

	"github.com/joho/godotenv"
	_ "github.com/jackc/pgx/v5/stdlib"
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
	if len(args) == 0 {
		args = []string{"up"}
	}

	if err := goose.RunContext(context.Background(), args[0], db, "migrations"); err != nil {
		slog.Error("migration error", "err", err)
		os.Exit(1)
	}
}
```

---

## Passo 9 — Primeira migration

Criar `migrations/000001_extensions.sql`:

```sql
-- +goose Up
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- +goose Down
DROP EXTENSION IF EXISTS "pg_trgm";
DROP EXTENSION IF EXISTS "uuid-ossp";
```

**Nota:** Rush Maestro usa ULIDs (gerados em Go) como PKs, não `uuid-ossp`. A extensão é incluída por compatibilidade futura. `pg_trgm` habilita buscas por similaridade de texto (útil para busca de posts/relatórios).

---

## Passo 10 — SQLC

Criar `sqlc.yaml`:

```yaml
version: "2"
sql:
  - engine: "postgresql"
    queries: "internal/repository/queries"
    schema: "migrations"
    gen:
      go:
        package: "db"
        out: "internal/repository/db"
        emit_json_tags: true
        emit_pointers_for_null_types: true
        emit_enum_valid_method: true
        emit_all_enum_values: true
        null_str: "pgtype"
        overrides:
          - db_type: "timestamptz"
            go_type: "time.Time"
          - db_type: "jsonb"
            go_type: "encoding/json.RawMessage"
```

Criar placeholder para que o sqlc não falhe se chamado antes das queries existirem:
```bash
touch /home/rafhael/www/html/marketing/api/internal/repository/queries/.gitkeep
```

---

## Passo 11 — .env e .env.example

Criar `api/.env` (não commitar — já está no .gitignore do projeto):

```bash
PORT=8080
DATABASE_URL=postgres://maestro:maestro@localhost:5432/rush_maestro?sslmode=disable
JWT_SECRET=dev-secret-must-be-at-least-32-characters-long
ADMIN_CORS_ORIGINS=http://localhost:5173
APP_ENV=development
```

Criar `api/.env.example` (commitar):

```bash
# Server
PORT=8080
APP_ENV=development  # 'production' para cookies seguros

# Database
DATABASE_URL=postgres://user:password@localhost:5432/rush_maestro?sslmode=disable

# Auth (gerar com: openssl rand -hex 32)
JWT_SECRET=

# CORS — origens permitidas para o admin panel (separadas por vírgula)
ADMIN_CORS_ORIGINS=http://localhost:5173

# Cookie
COOKIE_DOMAIN=  # deixar vazio para localhost; em produção: .seudominio.com
```

Adicionar ao `.gitignore` raiz do projeto (se ainda não estiver):
```
api/.env
api/*.db
```

---

## Passo 12 — .air.toml (live reload em dev)

Instalar air se não tiver: `go install github.com/air-verse/air@latest`

Criar `api/.air.toml`:

```toml
root = "."
tmp_dir = "tmp"

[build]
  bin = "./tmp/server"
  cmd = "go build -o ./tmp/server ./cmd/server"
  delay = 500
  exclude_dir = ["tmp", "vendor", "testutil"]
  include_ext = ["go"]
  kill_delay = "0s"

[log]
  time = false

[misc]
  clean_on_exit = true
```

---

## Passo 13 — Makefile

Criar `api/Makefile`:

```makefile
.PHONY: dev build migrate migrate-down migrate-status test lint sqlc docker-build

# Desenvolvimento com live reload
dev:
	air

# Build do binário
build:
	go build -o bin/server ./cmd/server

# Migrations
migrate:
	go run ./cmd/migrate up

migrate-down:
	go run ./cmd/migrate down

migrate-status:
	go run ./cmd/migrate status

migrate-create:
	@read -p "Migration name: " name; \
	goose -dir migrations create $$name sql

# Testes
test:
	go test -v ./...

test-integration:
	go test -v -tags=integration ./...

test-cover:
	go test -coverprofile=coverage.out ./...
	go tool cover -html=coverage.out

# Lint
lint:
	golangci-lint run ./...

# SQLC — regenerar código das queries
sqlc:
	sqlc generate

# Docker
docker-build:
	docker build -t rush-maestro:latest ..
```

---

## Passo 14 — docker-compose.yml (raiz do projeto)

Criar `/home/rafhael/www/html/marketing/docker-compose.yml`:

```yaml
services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: maestro
      POSTGRES_PASSWORD: maestro
      POSTGRES_DB: rush_maestro
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U maestro -d rush_maestro"]
      interval: 5s
      timeout: 5s
      retries: 5

  minio:
    image: minio/minio:latest
    command: server /data --console-address ":9001"
    environment:
      MINIO_ROOT_USER: minioadmin
      MINIO_ROOT_PASSWORD: minioadmin
    ports:
      - "9000:9000"
      - "9001:9001"
    volumes:
      - minio_data:/data
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:9000/minio/health/live"]
      interval: 10s
      timeout: 5s
      retries: 3

volumes:
  postgres_data:
  minio_data:
```

Criar `/home/rafhael/www/html/marketing/docker-compose.dev.yml`:

```yaml
# Uso: docker compose -f docker-compose.yml -f docker-compose.dev.yml up
services:
  api:
    build:
      context: ./api
      dockerfile: Dockerfile.dev
    environment:
      DATABASE_URL: postgres://maestro:maestro@postgres:5432/rush_maestro?sslmode=disable
      JWT_SECRET: dev-secret-must-be-at-least-32-characters-long
      PORT: "8080"
      APP_ENV: development
    ports:
      - "8080:8080"
    volumes:
      - ./api:/app
    depends_on:
      postgres:
        condition: service_healthy
    command: air
```

---

## Passo 15 — Verificação

Executar em ordem para verificar que tudo funciona:

```bash
cd /home/rafhael/www/html/marketing

# 1. Subir PostgreSQL
docker compose up -d postgres

# 2. Aguardar estar healthy
docker compose ps

# 3. Rodar migration
cd api && go run ./cmd/migrate up

# 4. Verificar migration aplicada
go run ./cmd/migrate status

# 5. Compilar o servidor
go build ./cmd/server

# 6. Rodar o servidor
go run ./cmd/server &

# 7. Testar health endpoint
curl -s http://localhost:8080/health
# Esperado: {"setup_required":false,"status":"ok"}

# 8. Matar o servidor de teste
kill %1

# 9. Verificar que compila sem erros
go vet ./...
```

**Saída esperada do health:**
```json
{"setup_required":false,"status":"ok"}
```

---

## O que NÃO fazer nesta task

- Não implementar lógica de auth (isso é T12)
- Não criar tabelas de negócio no banco (isso é T13)
- Não portar nenhuma funcionalidade do SvelteKit (isso é T14+)
- Não modificar nada em `src/` do SvelteKit atual — ele continua funcionando em paralelo
- Não criar Dockerfile de produção ainda (isso é fase 12 do roadmap)
- Não instalar sqlc globalmente — usar `go run github.com/sqlc-dev/sqlc/cmd/sqlc@latest generate` se necessário

---

## Critérios de conclusão

- [ ] `go build ./...` passa sem erros
- [ ] `go vet ./...` passa sem warnings
- [ ] `curl http://localhost:8080/health` retorna `{"setup_required":false,"status":"ok"}`
- [ ] `go run ./cmd/migrate status` mostra `000001_extensions` como `Applied`
- [ ] `docker compose up -d postgres && docker compose ps` mostra postgres healthy
- [ ] Estrutura de pastas conforme seção "Estrutura alvo" acima existe

---

## Referências

- rush-cms-v2 main.go: `/home/rafhael/www/html/rush-cms/rush-cms-v2/backend/cmd/server/main.go`
- rush-cms-v2 migrate: `/home/rafhael/www/html/rush-cms/rush-cms-v2/backend/cmd/migrate/main.go`
- rush-cms-v2 domain utils: `/home/rafhael/www/html/rush-cms/rush-cms-v2/backend/internal/domain/`
- Roadmap completo: `/home/rafhael/www/html/marketing/.project/tasks/README.md`
- Task seguinte: T12 — Auth + First-run
