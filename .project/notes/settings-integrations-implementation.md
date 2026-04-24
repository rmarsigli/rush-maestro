# Implementação: Settings com Tabs + Integrations Hub + Migração SQLite

> Documento de implementação gerado após brainstorm em 2026-04-24.
> Destinado ao próximo agente — contém todas as decisões, schemas, arquivos e ordem de execução.

---

## Decisões de arquitetura (não renegociar sem motivo forte)

1. **Integrações vivem no SQLite** — não em `integrations.json`. Razão: relações reais, atomicidade no OAuth callback, superfície menor de exposição.
2. **Clientes e posts migram para SQLite** — ver seção 9. O projeto cresceu além do que flat-file suporta bem.
3. **Arquivos de mídia ficam no filesystem** — blobs não pertencem ao SQLite neste contexto.
4. **Relatórios MD ficam no filesystem** — são documentos gerados, lidos como prose; sem razão para migrar.
5. **Settings com sub-rotas e tab bar** — mesmo padrão do `/social` (Planner/Drafts). Começa com General e Integrations.
6. **Um cliente tem no máximo UMA integração de Google Ads** — múltiplas integrações existem para diferentes GCP projects/contas MCC, não para o mesmo cliente.
7. **Migração do .env: manual** — só existe Pórtico no ads, sem automação necessária.

---

## 1. Schema SQLite — novas tabelas

O DB existe em `db/marketing.db`. As migrations ficam em `db/migrations/`. A migration atual é `001_schema.sql`. Criar `002_integrations.sql`:

```sql
-- 002_integrations.sql

CREATE TABLE IF NOT EXISTS integrations (
  id          TEXT PRIMARY KEY,                         -- slug gerado: 'agency-google-ads', 'portico-own'
  name        TEXT NOT NULL,                            -- label humano: "Agência — Conta Padrão"
  provider    TEXT NOT NULL,                            -- 'google_ads' | 'meta' | 'canva'
  -- OAuth app credentials (inseridos pelo usuário na UI)
  oauth_client_id     TEXT,
  oauth_client_secret TEXT,
  -- Provider-specific config
  developer_token     TEXT,                             -- Google Ads: developer token
  login_customer_id   TEXT,                             -- Google Ads: MCC customer ID (sem hífens)
  -- OAuth result
  refresh_token       TEXT,                             -- preenchido após OAuth
  status      TEXT NOT NULL DEFAULT 'pending',          -- 'pending' | 'connected' | 'error'
  error_message TEXT,                                   -- último erro, se houver
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Junction: qual tenant usa qual integração
-- Um tenant pode ter no máximo UMA integração por provider
-- Enforced via UNIQUE (tenant_id, provider) ou via check na camada de negócio
CREATE TABLE IF NOT EXISTS integration_clients (
  integration_id  TEXT NOT NULL REFERENCES integrations(id) ON DELETE CASCADE,
  tenant_id       TEXT NOT NULL,  -- o slug do cliente (ex: 'portico')
  PRIMARY KEY (integration_id, tenant_id)
);

-- Índice para lookup rápido: "qual integração usa este tenant?"
CREATE UNIQUE INDEX IF NOT EXISTS idx_integration_clients_tenant
  ON integration_clients (tenant_id);
-- UNIQUE enforça o "no máximo uma integração por tenant" sem precisar checar na app
```

> **Nota sobre segredos em texto plano:** Para localhost, aceitável — o arquivo `db/marketing.db` está no `.gitignore`. Para a versão desktop futura (Electrobun), mover os campos `oauth_client_secret` e `refresh_token` para o keychain do OS via `safeStorage`. Até lá, documentado como limitação.

---

## 2. Camada de dados — `lib/db/integrations.ts`

Criar arquivo novo. **Não modificar `lib/db/index.ts` diretamente** — esse arquivo já tem a lógica de conexão e schema de monitoring/alerts; manter separado.

```typescript
// lib/db/integrations.ts
import { getDb } from './index';  // reusar a conexão existente

export type IntegrationProvider = 'google_ads' | 'meta' | 'canva';
export type IntegrationStatus   = 'pending' | 'connected' | 'error';

export interface Integration {
  id: string;
  name: string;
  provider: IntegrationProvider;
  oauth_client_id: string | null;
  oauth_client_secret: string | null;
  developer_token: string | null;
  login_customer_id: string | null;
  refresh_token: string | null;
  status: IntegrationStatus;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

export interface IntegrationWithClients extends Integration {
  clients: string[];  // array de tenant_id
}

// CRUD básico
export function listIntegrations(): IntegrationWithClients[]
export function getIntegration(id: string): IntegrationWithClients | null
export function getIntegrationForTenant(tenantId: string, provider: IntegrationProvider): Integration | null
export function createIntegration(data: Omit<Integration, 'created_at' | 'updated_at'>): void
export function updateIntegration(id: string, data: Partial<Integration>): void
export function deleteIntegration(id: string): void
export function setIntegrationClients(integrationId: string, tenantIds: string[]): void
export function getCredentialsForTenant(tenantId: string, provider: IntegrationProvider): {
  oauth_client_id: string;
  oauth_client_secret: string;
  developer_token: string;
  login_customer_id: string;
  refresh_token: string;
} | null
```

A função `getCredentialsForTenant` é a principal — usada por `googleAds.ts` e `googleAdsDetailed.ts` em vez de `env.*`.

---

## 3. Migração do código que lê `env.GOOGLE_ADS_*`

### 3a. `ui/src/lib/server/googleAds.ts`

Trocar a seção que lê env vars:

```typescript
// ANTES
const clientId        = env.GOOGLE_ADS_CLIENT_ID;
const clientSecret    = env.GOOGLE_ADS_CLIENT_SECRET;
const developerToken  = env.GOOGLE_ADS_DEVELOPER_TOKEN;
const refreshToken    = env.GOOGLE_ADS_REFRESH_TOKEN;
const loginCustomerId = env.GOOGLE_ADS_LOGIN_CUSTOMER_ID?.replace(/-/g, '');

// DEPOIS
import { getCredentialsForTenant } from '$lib/server/db/integrations';  // wrapper server-side

const creds = getCredentialsForTenant(tenantId, 'google_ads');
if (!creds) throw new Error(`No Google Ads integration configured for ${tenantId}`);
const { oauth_client_id: clientId, oauth_client_secret: clientSecret,
        developer_token: developerToken, refresh_token: refreshToken,
        login_customer_id: loginCustomerId } = creds;
```

### 3b. `ui/src/lib/server/googleAdsDetailed.ts`

Mesma mudança. Recebe `tenantId` como parâmetro (provavelmente já recebe via context).

### 3c. `scripts/lib/ads.ts`

Os scripts rodam fora do SvelteKit. Precisam de acesso ao SQLite diretamente:

```typescript
// scripts/lib/ads.ts — adicionar função helper
import { Database } from 'bun:sqlite';
import path from 'node:path';

function getGoogleAdsCreds(tenantId: string) {
  const db = new Database(path.resolve('./db/marketing.db'));
  const row = db.query(`
    SELECT i.* FROM integrations i
    JOIN integration_clients ic ON ic.integration_id = i.id
    WHERE ic.tenant_id = ? AND i.provider = 'google_ads' AND i.status = 'connected'
    LIMIT 1
  `).get(tenantId) as any;
  db.close();
  return row;
}
```

Nos scripts que hoje passam customer_id via CLI, adicionar flag `--tenant` para lookup:
```bash
bun run scripts/deploy-google-ads.ts clients/portico/ads/google/camp.json --tenant portico
```

> **Fallback:** Se `--tenant` não for passado, tentar ler do `.env` como hoje (backward compat durante a transição).

---

## 4. OAuth flow — mudanças

### 4a. `ui/src/routes/api/auth/google-ads/+server.ts`

Aceitar `integration_id` como query param. Buscar credenciais no DB em vez do `.env`:

```typescript
// GET /api/auth/google-ads?integration_id=portico-own
export const GET: RequestHandler = async ({ url }) => {
  const integrationId = url.searchParams.get('integration_id');
  if (!integrationId) return new Response('integration_id required', { status: 400 });

  const integration = getIntegration(integrationId);  // do lib/db/integrations
  if (!integration?.oauth_client_id || !integration?.oauth_client_secret) {
    return new Response('Integration credentials not configured', { status: 400 });
  }

  // Embutir integration_id no OAuth state para o callback saber qual integração atualizar
  const state = Buffer.from(JSON.stringify({ integration_id: integrationId })).toString('base64');

  const authUrl = buildGoogleOAuthUrl({
    clientId: integration.oauth_client_id,
    redirectUri: `${origin}/api/auth/google-ads/callback`,
    state,
  });

  return redirect(302, authUrl);
};
```

### 4b. `ui/src/routes/api/auth/google-ads/callback/+server.ts`

Extrair `integration_id` do `state`, atualizar `refresh_token` no DB em vez de escrever no `.env`:

```typescript
export const GET: RequestHandler = async ({ url }) => {
  const code  = url.searchParams.get('code');
  const state = url.searchParams.get('state');

  const { integration_id } = JSON.parse(Buffer.from(state!, 'base64').toString());
  const integration = getIntegration(integration_id);

  const tokens = await exchangeCodeForTokens(code!, {
    clientId: integration.oauth_client_id!,
    clientSecret: integration.oauth_client_secret!,
    redirectUri: `${origin}/api/auth/google-ads/callback`,
  });

  updateIntegration(integration_id, {
    refresh_token: tokens.refresh_token,
    status: 'connected',
    updated_at: new Date().toISOString(),
  });

  // Redirecionar de volta para settings/integrations com mensagem de sucesso
  return redirect(302, '/settings/integrations?connected=true');
  // OU para o tenant que iniciou o flow, se soubermos qual é
};
```

> **Nota:** O redirect final deve voltar para a tela de integrations. Se precisar saber o tenant, incluir no `state` também.

---

## 5. Settings — estrutura de rotas

### Rotas a criar

```
ui/src/routes/[tenant]/settings/
  +layout.svelte          ← tab bar: General | Integrations
  +layout.server.ts       ← load brand + integrations (passar para sub-rotas)
  +page.server.ts         ← redirect para /general
  general/
    +page.svelte          ← brand info (o que estava em settings/+page.svelte antes)
    +page.server.ts       ← load + saveBrand action
  integrations/
    +page.svelte          ← lista de integrações + add/edit/delete
    +page.server.ts       ← load integrations, actions: create, update, delete, setClients
```

### `settings/+layout.svelte`

Mesmo padrão do `social/+layout.svelte`. Tab bar horizontal no topo da área de conteúdo:

```svelte
<script>
  const tabs = [
    { href: `/${data.tenant}/settings/general`,      label: 'General' },
    { href: `/${data.tenant}/settings/integrations`, label: 'Integrations' },
  ];
</script>

<!-- Tab bar estilo consistente com o resto do app -->
<div class="border-b border-slate-200 dark:border-slate-800">
  <nav class="flex gap-1 px-4 sm:px-6">
    {#each tabs as tab}
      <a href={tab.href} class="px-4 py-3 text-sm font-medium border-b-2 transition-colors
        {currentPath.startsWith(tab.href)
          ? 'border-indigo-500 text-indigo-600 dark:text-indigo-400'
          : 'border-transparent text-slate-500 hover:text-slate-700'}">
        {tab.label}
      </a>
    {/each}
  </nav>
</div>

<div class="flex-1 overflow-y-auto">
  {@render children()}
</div>
```

### `settings/+page.server.ts` (redirect)

```typescript
import { redirect } from '@sveltejs/kit';
export const load = async ({ params }) => {
  redirect(302, `/${params.tenant}/settings/general`);
};
```

---

## 6. Integrations page — UX e componentes

### `settings/integrations/+page.server.ts`

```typescript
export const load: PageServerLoad = async ({ params }) => {
  const integrations = listIntegrations();  // do lib/db/integrations
  const clients = await getClients();       // do lib/server/db
  return { tenant: params.tenant, integrations, clients };
};

export const actions: Actions = {
  create: async ({ request }) => {
    // Recebe: name, provider, oauth_client_id, oauth_client_secret, developer_token, login_customer_id
    // Gera id = nanoid() ou slug do name
    // Cria integração com status 'pending'
  },
  update: async ({ request }) => {
    // Recebe: id + campos a atualizar
  },
  delete: async ({ request }) => {
    // Recebe: id
    // ON DELETE CASCADE limpa integration_clients
  },
  setClients: async ({ request }) => {
    // Recebe: integration_id, client_ids[] (array de tenants selecionados)
    // Chama setIntegrationClients(id, clientIds)
    // Garante que nenhum tenant fique em duas integrações do mesmo provider
  },
};
```

### `settings/integrations/+page.svelte` — estrutura visual

```
[ + Add Google Ads Integration ]

┌──────────────────────────────────────────────────────────────┐
│ 🎯  Agência — Conta Padrão                    ● Connected   │
│     MCC: 123-456-7890 · developer token: ✓               │
│     Clients: Bracar Pneus · Pórtico · +1                    │
│                           [Edit]  [Re-auth]  [Delete]       │
└──────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────┐
│ 🎯  Pórtico — Conta Própria               ○ Not connected   │
│     Client ID: ✓ · Secret: ✓ · No refresh token            │
│     Clients: Pórtico                                        │
│                              [Edit]  [Connect →]  [Delete]  │
└──────────────────────────────────────────────────────────────┘
```

**Modal "Add / Edit Integration"** (bits-ui Dialog):
- Nome (text input)
- Provider (Select — só Google Ads por ora, disabled)
- OAuth Client ID (text input)
- OAuth Client Secret (password input — toggle visibility)
- Developer Token (text input)  
- Login / MCC Customer ID (text input, formato 123-456-7890)
- Clients assigned (MultiSelect — lista todos os tenants disponíveis)
- Botão "Save" → chama action `create` ou `update`
- Se status já é 'connected', mostrar badge e botão "Re-authorize"

**Botão "Connect →" / "Re-auth":**
- Abre `/api/auth/google-ads?integration_id=xxx` em nova aba ou redirect
- Após callback, redireciona de volta e a página mostra status updated

---

## 7. Mudança no `lib/db/index.ts` — carregar nova migration

O arquivo atual carrega `001_schema.sql`. Precisa carregar também `002_integrations.sql`:

```typescript
// lib/db/index.ts — na função de inicialização
const migrations = [
  path.resolve(__dir, '../../db/migrations/001_schema.sql'),
  path.resolve(__dir, '../../db/migrations/002_integrations.sql'),
];

for (const migration of migrations) {
  try {
    const sql = readFileSync(migration, 'utf-8');
    db.exec(sql);
  } catch (e) {
    // migration já aplicada (IF NOT EXISTS garante idempotência)
  }
}
```

---

## 8. Wrapper server-side para SvelteKit

O SvelteKit roda no contexto `ui/` mas `lib/db/integrations.ts` está na raiz. Criar um re-export em `ui/src/lib/server/integrations.ts`:

```typescript
// ui/src/lib/server/integrations.ts
// Re-exports the shared lib for use within SvelteKit server context
export {
  listIntegrations,
  getIntegration,
  getIntegrationForTenant,
  getCredentialsForTenant,
  createIntegration,
  updateIntegration,
  deleteIntegration,
  setIntegrationClients,
  type Integration,
  type IntegrationWithClients,
} from '../../../../lib/db/integrations';
```

Verificar se o path alias `$lib/server/integrations` resolve corretamente. Se o `tsconfig.json` já resolve `../../../../lib/db/` esse path funciona (já funciona para `$lib/server/db.ts`).

---

## 9. Migração de Clientes e Posts para SQLite (decisão maior)

### Recomendação: migrar em duas fases

**Fase 1 (junto com integrations):** Criar tabelas `clients` e `posts` no SQLite, mas **manter a leitura do flat-file** com uma função de sincronização. A UI continua funcionando; os agentes continuam gerando JSON files. Um job de sync (`sync-to-db`) importa os arquivos para o DB.

**Fase 2 (depois):** API routes passam a escrever diretamente no DB, flat-files tornam-se optional/readonly.

### Schema para Fase 1 — `003_clients_posts.sql`

```sql
-- Clients
CREATE TABLE IF NOT EXISTS clients (
  id          TEXT PRIMARY KEY,         -- slug: 'portico', 'bracar-pneus'
  name        TEXT NOT NULL,
  niche       TEXT,
  google_ads_id TEXT,
  brand_json  TEXT,                     -- JSON completo do brand.json (extensible)
  created_at  TEXT DEFAULT (datetime('now')),
  updated_at  TEXT DEFAULT (datetime('now'))
);

-- Posts
CREATE TABLE IF NOT EXISTS posts (
  id            TEXT PRIMARY KEY,         -- ex: '2026-04-01_meu-post'
  client_id     TEXT NOT NULL REFERENCES clients(id),
  filename      TEXT NOT NULL,            -- 'meu-post.json'
  status        TEXT NOT NULL,            -- 'draft' | 'approved' | 'scheduled' | 'published'
  title         TEXT NOT NULL,
  content       TEXT NOT NULL,
  hashtags      TEXT,                     -- JSON array: '["#tag1","#tag2"]'
  media_type    TEXT,
  platform      TEXT,                     -- JSON array de PostPlatform
  scheduled_date TEXT,
  scheduled_time TEXT,
  media_files   TEXT,                     -- JSON array de filenames
  workflow      TEXT,                     -- JSON do workflow do agente
  created_at    TEXT DEFAULT (datetime('now')),
  updated_at    TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_posts_client_id ON posts (client_id);
CREATE INDEX IF NOT EXISTS idx_posts_status    ON posts (status);
CREATE INDEX IF NOT EXISTS idx_posts_scheduled ON posts (scheduled_date);
```

### Sync script — `scripts/sync-clients-to-db.ts`

Script único que lê os flat-files e popula o DB. Rodar manualmente após implementar as tabelas:

```bash
bun run scripts/sync-clients-to-db.ts
```

Lógica: `INSERT OR REPLACE INTO clients ...` e `INSERT OR REPLACE INTO posts ...`. Idempotente — pode rodar múltiplas vezes.

### Mudança em `lib/db/index.ts` / `ui/src/lib/server/db.ts`

Após migração:
- `getClients()` → `SELECT * FROM clients`
- `getClientPosts(clientId)` → `SELECT * FROM posts WHERE client_id = ?`
- Manter as funções de escrita (`createPost`, `updatePost`, `deletePost`) apontando para DB

As API routes `+server.ts` que hoje fazem `fs.writeFile` / `fs.unlink` precisariam atualizar o DB em vez do filesystem. **Esta é a parte mais trabalhosa** — cada endpoint de mutação precisa de update.

> **Sugestão:** Implementar integrations (fases 1-8 acima) primeiro, validar, depois abordar a migração de clients/posts separadamente. São mudanças independentes.

---

## 10. Arquivos a criar / modificar — checklist completo

### Criar (novos)
- [ ] `db/migrations/002_integrations.sql` — schema das tabelas de integrations
- [ ] `db/migrations/003_clients_posts.sql` — schema de clients + posts (fase 2)
- [ ] `lib/db/integrations.ts` — CRUD de integrations
- [ ] `ui/src/lib/server/integrations.ts` — re-export para SvelteKit
- [ ] `ui/src/routes/[tenant]/settings/+layout.svelte` — tab bar
- [ ] `ui/src/routes/[tenant]/settings/+layout.server.ts` — load comum
- [ ] `ui/src/routes/[tenant]/settings/+page.server.ts` — redirect para /general
- [ ] `ui/src/routes/[tenant]/settings/general/+page.svelte` — brand info (mover de settings/)
- [ ] `ui/src/routes/[tenant]/settings/general/+page.server.ts` — load + saveBrand action
- [ ] `ui/src/routes/[tenant]/settings/integrations/+page.svelte` — integrations hub
- [ ] `ui/src/routes/[tenant]/settings/integrations/+page.server.ts` — load + actions

### Modificar (existentes)
- [ ] `lib/db/index.ts` — carregar nova migration ao inicializar
- [ ] `ui/src/lib/server/googleAds.ts` — trocar `env.*` por `getCredentialsForTenant`
- [ ] `ui/src/lib/server/googleAdsDetailed.ts` — idem
- [ ] `ui/src/routes/api/auth/google-ads/+server.ts` — aceitar `integration_id`, buscar creds no DB
- [ ] `ui/src/routes/api/auth/google-ads/callback/+server.ts` — gravar token no DB via `updateIntegration`
- [ ] `ui/src/routes/[tenant]/settings/+page.svelte` — remover (conteúdo vai para /general)
- [ ] `ui/src/routes/[tenant]/settings/+page.server.ts` — virar redirect

### Opcionais (fase 2 — migração clients/posts)
- [ ] `scripts/sync-clients-to-db.ts` — sync flat-file → DB
- [ ] `lib/db/index.ts` — reescrever `getClients()` e `getClientPosts()` para SQLite
- [ ] `ui/src/lib/server/db.ts` — atualizar todas as funções de escrita
- [ ] Cada `+server.ts` de mutation de post/client — apontar para DB

---

## 11. Ordem de implementação recomendada

```
1. db/migrations/002_integrations.sql
2. lib/db/integrations.ts  (CRUD puro, testável)
3. ui/src/lib/server/integrations.ts  (re-export)
4. lib/db/index.ts  (carregar nova migration)
5. ui/src/routes/api/auth/google-ads/ (ambos os endpoints)
6. ui/src/routes/[tenant]/settings/ reestruturar em sub-rotas
7. settings/general/ (mover conteúdo atual)
8. settings/integrations/ (página principal + actions)
9. ui/src/lib/server/googleAds.ts + googleAdsDetailed.ts (trocar env por DB)
10. Testar OAuth flow completo (add integration → connect → use in ads page)
11. [Fase 2] db/migrations/003_clients_posts.sql + sync script + migrate reads
```

---

## 12. Contexto de referência para o próximo agente

### Stack do projeto
- Runtime: Bun (bun:sqlite nativo)
- UI: SvelteKit 2 + Svelte 5 runes + Tailwind v4
- UI Components: bits-ui v2 (Dialog, DropdownMenu, Popover, Tooltip já em uso)
- DB: SQLite em `db/marketing.db`, connection em `lib/db/index.ts`
- Sem ORM — queries SQL direto com `bun:sqlite`

### Padrões de código existentes
- Svelte 5: `$props()`, `$state()`, `$derived()`, `$effect()` — sem stores legados
- SvelteKit form actions para mutações no servidor
- `import { Dialog, DropdownMenu, Popover, Tooltip } from 'bits-ui'` no client
- `import { cn } from '$lib/utils'` para merge de classes
- Tipos em `lib/db/index.ts` (Brand, Post, PostWithMeta) e `ui/src/lib/server/db.ts`
- Sem `any` — tipagem estrita
- Sem `dotenv.config()` — Bun injeta o `.env` automaticamente

### Arquivo `lib/db/index.ts` — como usar a conexão
```typescript
// Exporta getDb() que retorna a instância singleton
// Já inicializa o schema ao primeiro acesso
import { getDb } from './index';
const db = getDb();
const rows = db.query('SELECT * FROM integrations').all();
```

### Arquivos de settings atualmente
- `ui/src/routes/[tenant]/settings/+page.svelte` — brand info form (já existe)
- `ui/src/routes/[tenant]/settings/+page.server.ts` — load + saveBrand action (já existe)
- Esses dois arquivos precisam ser movidos para `settings/general/`

### Google Ads env vars atuais (referência para migração)
```
GOOGLE_ADS_CLIENT_ID        → integrations.oauth_client_id
GOOGLE_ADS_CLIENT_SECRET    → integrations.oauth_client_secret
GOOGLE_ADS_DEVELOPER_TOKEN  → integrations.developer_token
GOOGLE_ADS_REFRESH_TOKEN    → integrations.refresh_token
GOOGLE_ADS_LOGIN_CUSTOMER_ID → integrations.login_customer_id
```
