# Marketing CMS — Contexto para Claude Code

Sistema local de gestão de marketing com suporte a múltiplos clientes. Combina CMS flat-file (JSON), geração de conteúdo via IA e integração com Google Ads API.

## Stack

- **Runtime:** Bun
- **UI:** SvelteKit (Svelte 5 runes) + Tailwind v4 + `@tailwindcss/typography`
- **Google Ads:** `google-ads-api` npm package (v23)
- **Markdown:** `marked` v18 (server-side, para relatórios)
- **Armazenamento:** Flat-file JSON/MD em `clients/[tenant]/`
- **Env:** variáveis em `.env` (nunca commitadas)

## Clientes

Cada cliente vive em `clients/[tenant]/`. Use `/create-client` para criar novos.

O `google_ads_id` de cada cliente fica em `clients/[tenant]/brand.json`.
IDs reais, tracking tags e URLs de clientes **nunca** vão neste arquivo — ficam só no `brand.json` e no `.env`.

## Estrutura de Diretórios

```
clients/[tenant]/
  brand.json          — briefing, tom, hashtags, persona, google_ads_id
  posts/              — posts gerados (JSON ou MD)
  ads/google/         — campanhas e anúncios Google Ads
  reports/            — relatórios de auditoria e performance (MD)

scripts/
  lib/
    ads.ts            — client factory compartilhado (importar daqui, não criar boilerplate)
  test-ads-connection.ts   — verifica conexão com Google Ads API
  test-query.ts            — query de campanha por ID
  test-query-ag.ts         — query de ad groups por campanha
  test-query-history.ts    — histórico 30 dias por campanha
  deploy-google-ads.ts     — deploy de JSON aprovado para o Google Ads
  publish-social-post.ts   — publicação de posts via Meta Graph API

ui/src/routes/[tenant]/
  social/             — gestão de posts sociais (draft/approved/published)
  ads/google/         — campanhas Google Ads (local + live API)
  reports/            — listagem e visualização de relatórios MD em prose
  settings/           — configurações do cliente

.claude/
  agents/             — personas de agentes IA por cliente
  skills/             — skills Claude Code customizadas
```

## Scripts

Todos os scripts rodam via `bun run <arquivo>` a partir da raiz do projeto. Bun injeta o `.env` automaticamente — nunca usar `dotenv.config()`.

```bash
bun run scripts/test-ads-connection.ts <customer-id>
bun run scripts/test-query.ts <customer-id> <campaign-id>
bun run scripts/test-query-ag.ts <customer-id> <campaign-id>
bun run scripts/test-query-history.ts <customer-id> <campaign-id>
bun run scripts/deploy-google-ads.ts clients/<tenant>/ads/google/<campaign>.json
bun run scripts/publish-social-post.ts <tenant> <post-filename>.json
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
  'your-client': 'CUSTOMER_ID_HERE', // vem do brand.json → google_ads_id
};
```

## UI — Tipos e Convenções

A UI usa tipagem estrita — sem `any`. Tipos centrais:

- `ui/src/lib/server/db.ts` → `Brand`, `Post`, `PostWithMeta`, `GoogleAdCampaign`, `GoogleAdCampaignWithMeta`
- `ui/src/lib/server/googleAds.ts` → `LiveCampaign`
- `ui/src/lib/server/googleAdsDetailed.ts` → `DetailedCampaign`, `CampaignAdGroup`, `AdGroupMetrics`, `HistoryEntry`

## Relatórios

Relatórios são arquivos `.md` em `clients/[tenant]/reports/`. A UI detecta o tipo pelo nome do arquivo:

| Padrão no slug | Tipo | Cor |
|---|---|---|
| `audit` | Audit | amber |
| `search` / `campaign` | Search Campaign | blue |
| `weekly` | Weekly | emerald |
| `monthly` / `YYYY-MM` no final | Monthly | violet |
| `alert` | Alert | red |
| outros | Report | slate |

Convenções de nome:
- Auditoria: `google-ads-audit-YYYY-MM-DD.md`
- Performance mensal: `google-ads-YYYY-MM.md`
- Campanha Search: `google-ads-search-YYYY-MM-DD.md`

A rota `/[tenant]/reports/[slug]` renderiza o MD em prose com botão "Download PDF" (via `window.print()`).

## Regras Operacionais — Google Ads

**Nunca alterar campanhas ao vivo de forma autônoma.** Toda mudança em campanha ativa exige confirmação explícita antes de executar via API.

Fluxo obrigatório:
1. Análise e diagnóstico → executa livremente
2. Rascunho de mudança → gera, mostra, aguarda OK
3. Mudança em campanha ao vivo → descreve ação, aguarda confirmação, então executa
4. Confirma resultado via query após execução

## Convenções Gerais

- Flat-file first — sem banco de dados
- `clients/` está no `.gitignore` — contém dados sensíveis de clientes
- Commits seguem Conventional Commits: `feat:`, `fix:`, `chore:`, `refactor:`, `docs:`
- IDs de clientes, campaign IDs e tracking tags nunca entram em arquivos commitados
