# Tasks — Marketing CMS Refactor

Refatoração guiada pelo **ADR-001** (`.project/adrs/001-sveltekit-sqlite-mcp.md`).  
Objetivo: mover SvelteKit para a raiz, substituir flat-files por SQLite, expor MCP em `/mcp`.

---

## Estado atual

**Última task concluída:** T04 — seed flat-files → SQLite

| Task | Status | Descrição |
|---|---|---|
| T01 | ✅ completed | Move SvelteKit de `ui/` para root |
| T02 | ✅ completed | Drop dual-runtime shim, usar `bun:sqlite` direto |
| T03 | ✅ completed | Migrations SQLite: tenants, posts, reports, campaigns |
| T04 | ✅ completed | Seed script: flat-files → SQLite |
| T05 | ✅ completed | Funções TS da camada de dados (`src/lib/server/`) |
| T06 | ✅ completed | Storage adapter interface + implementação local |
| T07 | ⬜ pending | Migrar rotas UI de `fs.readFile` para funções SQLite |
| T08 | ⬜ pending | MCP server setup em `/mcp` via SvelteKit |
| T09 | ⬜ pending | MCP tools e resources |
| T10 | ⬜ pending | Cleanup: remover flat-files, atualizar scripts e CLAUDE.md |

---

## O que foi feito em T01

- `ui/src/` → `src/`, `ui/static/` → `static/`, configs movidos para root
- `lib/db/` → `src/lib/server/db/` com `process.cwd()` para resolução de paths
- `package.json` mergeado na raiz (todas as deps unificadas)
- Alias `@` → `src/` adicionado em `svelte.config.js` (e `vite.config.ts`)
- Alias `$db` → `src/lib/server/db/` atualizado (mantido para compatibilidade)
- `scripts/collect-daily-metrics.ts` e `consolidate-monthly.ts` com imports atualizados
- `.gitignore` limpo (sem prefixos `ui/`)
- `bun run check` → 0 errors, 52 warnings a11y pré-existentes

---

## Próximo passo: T05

T05 cria as funções TypeScript da camada de dados em `src/lib/server/`. Estas funções substituem todas as chamadas diretas a `fs.readFile`/`fs.readdir` e a lógica flat-file espalhada pelos `+page.server.ts`. Nenhuma rota ou MCP tool deve consultar o SQLite diretamente.

**O que fazer:**
1. Criar `src/lib/server/tenants.ts` — `listTenants`, `getTenant`, `createTenant`, `updateTenant`, `deleteTenant`
2. Criar `src/lib/server/posts.ts` — `listPosts`, `getPost`, `createPost`, `updatePost`, `updatePostStatus`, `deletePost`
3. Criar `src/lib/server/reports.ts` — `listReports`, `getReport`, `createReport`, `deleteReport`, `detectReportType`
4. Criar `src/lib/server/campaigns.ts` — `listCampaigns`, `getCampaign`, `upsertCampaign`, `markDeployed`, `deleteCampaign`
5. Verificar com script inline ou `bun --eval`

Ver tipos e assinaturas completos em `T05-data-layer-functions.md`.

---

## Sequência de dependências

```
T02 → T03 → T04
            T05 → T07 → T10
T02 → T08 → T09
T05 → T09
T06 → T07
```

T05 e T06 podem ser desenvolvidas em paralelo após T03.  
T08 pode ser iniciada após T02 (não depende de SQLite).  
**Não iniciar T10** antes de T07 e T09 estarem verificadas.

---

## Contexto técnico relevante

- Runtime: **Bun** (único, sem Node). Após T02, `bun:sqlite` é o único driver.
- Dev server: `bun run dev` na raiz do projeto (porta 5173 por padrão)
- DB: `db/marketing.db` — gerado automaticamente na primeira chamada a `getDb()`
- Clientes ativos: `portico`, `bracar-pneus` (dados em `clients/[tenant]/`)
- Flat-files ainda ativos: posts, brand, reports, campaigns em `clients/`
- SQLite já ativo para: integrations, monitoring, alerts, agent-runs

---

## Regras do projeto

- Commits seguem Conventional Commits: `feat:`, `fix:`, `chore:`, `refactor:`, `docs:`
- Tasks concluídas vão para `tasks/completed/` com `**Status:** completed`
- Nunca alterar campanhas Google Ads ao vivo sem confirmação explícita
- IDs de clientes e tracking tags nunca entram em arquivos commitados
