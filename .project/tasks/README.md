# Tasks — Marketing CMS Refactor

Refatoração guiada pelo **ADR-001** (`.project/adrs/001-sveltekit-sqlite-mcp.md`).  
Objetivo: mover SvelteKit para a raiz, substituir flat-files por SQLite, expor MCP em `/mcp`.

---

## Estado atual

**Última task concluída:** T08 — MCP server setup em `/mcp`

| Task | Status | Descrição |
|---|---|---|
| T01 | ✅ completed | Move SvelteKit de `ui/` para root |
| T02 | ✅ completed | Drop dual-runtime shim, usar `bun:sqlite` direto |
| T03 | ✅ completed | Migrations SQLite: tenants, posts, reports, campaigns |
| T04 | ✅ completed | Seed script: flat-files → SQLite |
| T05 | ✅ completed | Funções TS da camada de dados (`src/lib/server/`) |
| T06 | ✅ completed | Storage adapter interface + implementação local |
| T07 | ✅ completed | Migrar rotas UI de `fs.readFile` para funções SQLite |
| T08 | ✅ completed | MCP server setup em `/mcp` via SvelteKit |
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

## Próximo passo: T09

T09 registra todas as MCP tools e resources no servidor. Tools chamam as funções da camada de dados (T05); resources expõem dados read-only para browsing de agentes.

**O que fazer:**
1. Criar `src/lib/server/mcp/tools/content.ts` — tools de tenants, posts, reports, campaigns
2. Importar e registrar no `createServer()` em `server.ts`
3. Verificar com MCP Inspector ou `/mcp` no Claude Code

Ver detalhes em `T09-mcp-tools-and-resources.md`.

**Atenção:** O servidor MCP usa `createServer()` (factory stateless) — cada request cria uma nova instância. Tools e resources devem ser registradas dentro da factory, não no módulo.

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
