# Marketing CMS — Contexto para Claude Code

Sistema local de gestão de marketing com suporte a múltiplos clientes. Combina CMS com SQLite, geração de conteúdo via IA, integração com Google Ads API e servidor MCP para agentes.

## Stack

- **Runtime:** Bun
- **UI:** SvelteKit (Svelte 5 runes) + Tailwind v4 + `@tailwindcss/typography`
- **Banco de dados:** SQLite via `bun:sqlite` em `db/marketing.db`
- **MCP:** `@modelcontextprotocol/sdk` exposto em `POST /mcp` (Streamable HTTP)
- **Google Ads:** `google-ads-api` npm package (v23)
- **Markdown:** `marked` v18 (server-side, para relatórios)
- **Armazenamento:** SQLite para conteúdo; imagens em `storage/images/[tenant]/`
- **Env:** variáveis em `.env` (nunca commitadas)

## Clientes

Cada cliente tem um registro em `tenants` no SQLite. Use a MCP tool `create_tenant` ou o seed script para criar novos.

O `google_ads_id` de cada cliente fica em SQLite (`tenants.google_ads_id`).
IDs reais, tracking tags e URLs de clientes **nunca** vão em arquivos commitados — ficam só no banco e no `.env`.

## Estrutura de Diretórios

```
src/
  routes/
    [tenant]/
      social/         — gestão de posts sociais (draft/approved/published)
      ads/google/     — campanhas Google Ads (local + live API)
      reports/        — listagem e visualização de relatórios MD em prose
      settings/       — configurações do cliente
    mcp/              — endpoint MCP (POST /mcp, GET /mcp, DELETE /mcp)
    api/              — REST endpoints internos

  lib/server/
    tenants.ts        — CRUD de clientes (SQLite)
    posts.ts          — CRUD de posts sociais (SQLite)
    reports.ts        — CRUD de relatórios (SQLite)
    campaigns.ts      — CRUD de campanhas Google Ads (SQLite)
    googleAds.ts      — consulta live de campanhas via API
    googleAdsDetailed.ts — métricas detalhadas + histórico
    storage.ts        — leitura/escrita de imagens em storage/images/
    mcp/
      server.ts       — createServer() factory (registra tools e resources)
      tools/
        content.ts    — tools: tenants, posts, reports, campaigns, alerts
        ads.ts        — tools: get_live_metrics
      resources/
        tenants.ts    — resources: tenant://list, tenant://{id}/brand|posts|reports
    db/
      index.ts        — getDb(), migrations automáticas
      monitoring.ts   — métricas diárias e mensais
      alerts.ts       — alert_events (WARN/CRITICAL)
      agent-runs.ts   — log de execuções de agentes

scripts/
  lib/
    ads.ts            — client factory compartilhado (importar daqui, não criar boilerplate)
  test-ads-connection.ts   — verifica conexão com Google Ads API
  test-query.ts            — query de campanha por ID
  test-query-ag.ts         — query de ad groups por campanha
  test-query-history.ts    — histórico 30 dias por campanha
  deploy-google-ads.ts     — deploy de campanha aprovada para o Google Ads
  publish-social-post.ts   — publicação de posts via Meta Graph API
  collect-daily-metrics.ts — coleta métricas diárias do Google Ads → SQLite
  consolidate-monthly.ts   — consolida métricas mensais → SQLite

storage/images/[tenant]/   — imagens de posts (servidas por /api/media/[tenant]/[filename])
db/marketing.db            — banco SQLite (gerado automaticamente, não commitado)

.mcp.json                  — config MCP para Claude Code e Gemini CLI
.claude/
  agents/             — personas de agentes IA por cliente
  skills/             — skills Claude Code customizadas
```

## MCP Server

O servidor MCP expõe a camada de dados a agentes externos (Claude Code, Gemini CLI, etc.).

- **Endpoint:** `http://localhost:5173/mcp` (Streamable HTTP, stateless)
- **Config:** `.mcp.json` na raiz — detectado automaticamente pelo Claude Code
- **Transporte:** `WebStandardStreamableHTTPServerTransport` (instância nova por request)

### Tools disponíveis

| Tool | Descrição |
|---|---|
| `list_tenants` | Lista todos os clientes |
| `get_tenant` | Brand config e persona de um cliente |
| `create_tenant` | Cria novo cliente |
| `update_tenant` | Edita brand config |
| `list_posts` | Posts de um cliente (filtro opcional por status) |
| `get_post` | Post individual com workflow |
| `create_post` | Cria novo rascunho |
| `update_post_status` | Transição de status (draft → approved → published) |
| `delete_post` | Remove post |
| `list_reports` | Relatórios de um cliente |
| `get_report` | Conteúdo markdown completo de um relatório |
| `create_report` | Salva novo relatório |
| `list_campaigns` | Campanhas locais de um cliente |
| `get_campaign` | JSON completo de uma campanha |
| `check_alerts` | Alertas de monitoramento em aberto |
| `get_live_metrics` | Métricas ao vivo do Google Ads API |

### Resources disponíveis

| URI | Descrição |
|---|---|
| `tenant://list` | Lista todos os tenants (JSON) |
| `tenant://{id}/brand` | Brand config de um tenant |
| `tenant://{id}/posts` | Todos os posts de um tenant |
| `tenant://{id}/reports` | Lista de relatórios de um tenant |
| `tenant://{id}/reports/{slug}` | Conteúdo markdown de um relatório |

## Scripts

Todos os scripts rodam via `bun run <arquivo>` a partir da raiz do projeto. Bun injeta o `.env` automaticamente — nunca usar `dotenv.config()`.

```bash
bun run scripts/test-ads-connection.ts <customer-id>
bun run scripts/test-query.ts <customer-id> <campaign-id>
bun run scripts/test-query-ag.ts <customer-id> <campaign-id>
bun run scripts/test-query-history.ts <customer-id> <campaign-id>
bun run scripts/deploy-google-ads.ts <path-to-campaign.json> <tenant_id>
bun run scripts/publish-social-post.ts <tenant_id> <post_id>
bun run scripts/collect-daily-metrics.ts <tenant> [YYYY-MM-DD]
bun run scripts/consolidate-monthly.ts <tenant> [YYYY-MM]
```

**Scripts temporários de análise** devem ser criados na raiz (não em `/tmp`) e removidos após uso.

### scripts/lib/ads.ts — usar sempre

Todo script que acessa o Google Ads importa daqui. Nunca instanciar `GoogleAdsApi` diretamente nos scripts.

```typescript
import { ads, getCustomer, enums, micros, fromMicros } from './scripts/lib/ads.ts';

// Client pré-configurado (definido em CLIENTS no ads.ts)
await ads['your-client'].query(`SELECT ...`);

// Client ad-hoc (qualquer customer ID)
const c = getCustomer('123-456-7890');

// Helpers de moeda
micros(50)       // → 50_000_000
fromMicros(m)    // → valor em R$
```

Para adicionar um cliente ao `ads` pré-configurado, editar `scripts/lib/ads.ts`:
```typescript
export const CLIENTS: Record<string, string> = {
  'your-client': 'CUSTOMER_ID_HERE', // vem do SQLite → tenants.google_ads_id
};
```

## UI — Tipos e Convenções

A UI usa tipagem estrita — sem `any`. Tipos centrais:

- `src/lib/server/tenants.ts` → `Tenant`, `AdsMonitoringConfig`
- `src/lib/server/posts.ts` → `Post`, `PostStatus`, `MediaType`, `PostWorkflow`
- `src/lib/server/reports.ts` → `Report`, `ReportType`
- `src/lib/server/campaigns.ts` → `Campaign`
- `src/lib/server/googleAds.ts` → `LiveCampaign`
- `src/lib/server/googleAdsDetailed.ts` → `DetailedCampaign`, `CampaignAdGroup`, `AdGroupMetrics`, `HistoryEntry`
- `src/lib/server/db.ts` → `PostWithMeta`, `PostPlatform`, `GoogleAdCampaignWithMeta` (tipos de UI, shapes criados pelos loaders)

## Relatórios

Relatórios são registros em SQLite (`reports` table) com conteúdo markdown. A UI detecta o tipo pelo slug:

| Padrão no slug | Tipo | Cor |
|---|---|---|
| `audit` | Audit | amber |
| `search` / `campaign` | Search Campaign | blue |
| `weekly` | Weekly | emerald |
| `monthly` / `YYYY-MM` no final | Monthly | violet |
| `alert` | Alert | red |
| outros | Report | slate |

Convenções de nome (slug):
- Auditoria: `google-ads-audit-YYYY-MM-DD`
- Performance mensal: `google-ads-YYYY-MM`
- Campanha Search: `google-ads-search-YYYY-MM-DD`

A rota `/[tenant]/reports/[slug]` renderiza o MD em prose com botão "Download PDF" (via `window.print()`).
Para criar relatórios: MCP tool `create_report` ou `createReport()` de `src/lib/server/reports.ts`.

## Regras Operacionais — Google Ads

**Nunca alterar campanhas ao vivo de forma autônoma.** Toda mudança em campanha ativa exige confirmação explícita antes de executar via API.

Fluxo obrigatório:
1. Análise e diagnóstico → executa livremente
2. Rascunho de mudança → gera, mostra, aguarda OK
3. Mudança em campanha ao vivo → descreve ação, aguarda confirmação, então executa
4. Confirma resultado via query após execução

## Convenções Gerais

- SQLite é a fonte de verdade para todo conteúdo (posts, reports, campaigns, tenants)
- `clients/` está no `.gitignore` — contém apenas imagens legadas de posts
- `db/marketing.db` está no `.gitignore` — gerado automaticamente pelo `getDb()`
- Commits seguem Conventional Commits: `feat:`, `fix:`, `chore:`, `refactor:`, `docs:`
- IDs de clientes, campaign IDs e tracking tags nunca entram em arquivos commitados
