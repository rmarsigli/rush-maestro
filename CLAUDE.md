# Marketing CMS — Contexto para Claude Code

Sistema local de gestão de marketing com suporte a múltiplos clientes. Combina CMS flat-file (JSON), geração de conteúdo via IA e integração com Google Ads API.

## Stack

- **Runtime:** Bun
- **UI:** SvelteKit (Svelte 5 runes) + Tailwind v4
- **Google Ads:** `google-ads-api` npm package (v23)
- **Armazenamento:** Flat-file JSON em `clients/[tenant]/`
- **Env:** variáveis em `.env` (nunca commitadas)

## Clientes

### Grupo Pórtico (`clients/portico/`)
- **Segmento:** Reformas residenciais de alto padrão, Porto Alegre-RS
- **Google Ads Customer ID:** `CUSTOMER-ID-REDACTED` (limpo: `CUSTOMER_ID_REDACTED`)
- **Site:** your-client-site.com
- **Tags no site:** GA4 `GA4_ID_REDACTED`, Google Tag `GTAG_ID_REDACTED` (sem GTM)
- **Canais ativos:** Google Ads + Social Media (Instagram/Facebook)
- **Relatórios:** `clients/portico/reports/`

### Bracar Pneus (`clients/bracar-pneus/`)
- **Segmento:** Pneus e suspensão, Caraguatatuba e São Sebastião-SP
- **Canais ativos:** Social Media (Instagram/Facebook — mesmo post para os dois)
- **Relatórios:** `clients/bracar-pneus/reports/`

## Estrutura de Diretórios

```
clients/[tenant]/
  brand.json          — briefing, tom, hashtags, persona
  posts/              — posts gerados (JSON ou MD)
  ads/google/         — campanhas e anúncios Google Ads
  reports/            — relatórios de auditoria e performance (MD)

scripts/
  lib/
    ads.ts            — client factory compartilhado (importar daqui, não criar boilerplate)
  test-ads-connection.ts   — verifica conexão com Google Ads API
  test-query.ts            — query de campanha (Pórtico)
  test-query-ag.ts         — query de ad groups
  test-query-history.ts    — histórico 30 dias
  deploy-google-ads.ts     — deploy de JSON aprovado para o Google Ads
  publish-social-post.ts   — publicação de posts via Meta Graph API

.claude/
  agents/             — personas de agentes IA por cliente
  skills/             — skills Claude Code customizadas
```

## Scripts

Todos os scripts rodam via `bun run <arquivo>` a partir da raiz do projeto. Bun injeta o `.env` automaticamente — nunca usar `dotenv.config()`.

```bash
bun run scripts/test-ads-connection.ts
bun run scripts/deploy-google-ads.ts clients/portico/ads/google/<campaign>.json
bun run scripts/publish-social-post.ts portico 2025-04-15_lancamento.json
```

**Scripts temporários de análise** devem ser criados na raiz (não em `/tmp`) e removidos após uso.

### scripts/lib/ads.ts — usar sempre

Todo script que acessa o Google Ads importa daqui. Nunca instanciar `GoogleAdsApi` diretamente nos scripts.

```typescript
import { ads, getCustomer, enums, micros, fromMicros } from './scripts/lib/ads.ts';

// Client pré-configurado
await ads.portico.query(`SELECT ...`);

// Client ad-hoc (outro customer ID)
const c = getCustomer('123-456-7890');

// Helpers de moeda
micros(50)       // → 50_000_000
fromMicros(m)    // → valor em R$
```

## Regras Operacionais — Google Ads

**Nunca alterar campanhas ao vivo de forma autônoma.** Toda mudança em campanha ativa exige confirmação explícita antes de executar via API.

Fluxo obrigatório:
1. Análise e diagnóstico → executa livremente
2. Rascunho de mudança → gera, mostra, aguarda OK
3. Mudança em campanha ao vivo → descreve ação, aguarda confirmação, então executa
4. Confirma resultado via query após execução

## Convenções

- Flat-file first — sem banco de dados
- `clients/` está no `.gitignore` — contém dados sensíveis de clientes
- Relatórios de auditoria: `clients/[tenant]/reports/google-ads-audit-YYYY-MM-DD.md`
- Relatórios de performance mensal: `clients/[tenant]/reports/google-ads-YYYY-MM.md`
