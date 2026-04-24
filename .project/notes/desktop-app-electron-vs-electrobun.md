# Desktop App: Electron vs Electrobun — Análise Técnica de Adesão

> Nota técnica para decisão de migração do marketing CMS de webapp local para app desktop empacotado.
> Baseada na análise do codebase atual + pesquisa de estado dos frameworks em abril/2026.

---

## 1. Contexto e motivação

O projeto hoje roda como um servidor SvelteKit local iniciado via `bun run dev` ou `bun run build && bun run preview`. O usuário acessa via browser em `localhost:5173`. Essa abordagem funciona, mas tem fricção:

- Requer Bun instalado no sistema
- Requer terminal aberto e comando manual para iniciar
- Sem auto-update
- Não parece um produto — parece um projeto de desenvolvimento

A migração para desktop empacotado resolve esses pontos sem necessariamente reescrever nada da lógica de negócio.

---

## 2. Abordagem arquitetural comum a ambos os frameworks

A estratégia recomendada para este projeto (independente do framework escolhido) é **servidor embutido**, não IPC rewrite:

```
Desktop main process (Node.js ou Bun)
  └─ spawna / importa → SvelteKit (adapter-node) em porta aleatória
       └─ BrowserWindow/webview → http://localhost:PORT
```

Isso preserva **100% do código existente**: UI, API routes, SSR, streaming, lógica de negócio. A alternativa (adapter-static + IPC handlers para cada `+server.ts`) exigiria reescrever as ~20 rotas de API e não vale o custo dado o volume.

---

## 3. Electron — análise

### Vantagens
- Ecossistema maduro: 114k stars, 10+ anos, vasta documentação
- `electron-builder` e `electron-forge` resolvem build/packaging multiplataforma de forma confiável
- Squirrel para auto-update está battle-tested
- Chromium embutido: zero surpresas de compatibilidade CSS/JS em qualquer plataforma
- Comunidade enorme: Stack Overflow, plugins, templates

### Desvantagens para este projeto
- **Problema central: Bun → Node.js no main process.** O Electron usa Node.js nativo. Todo script do projeto (`deploy-google-ads.ts`, `publish-social-post.ts`, `collect-daily-metrics.ts`, etc.) usa sintaxe Bun-first e Bun injeta `.env` automaticamente. A solução seria manter `bun` no PATH do sistema e usar `child_process.spawn('bun', ['run', script])` — funciona, mas é um shim feio.
- **better-sqlite3 é um addon nativo** (`.node`). Requer `electron-rebuild` após install para recompilar contra a versão do Node que o Electron usa. Isso complica o CI/CD, especialmente em Windows onde toolchains de compilação nativa são frágeis.
- **Bundle ~150MB** por causa do Chromium embutido.
- **Code signing e notarization** no macOS são um processo lento e burocrático com Electron (o criador do Electrobun migrou *por causa* disso especificamente).

---

## 4. Electrobun — análise aprofundada

### Estado atual (abril/2026)
Electrobun v1 foi lançado em **fevereiro de 2026** após dois anos de desenvolvimento. Não é mais alpha/experimental. Features shipped no v1:

- Cross-platform window controls, menus, accelerators, global shortcuts
- Clipboard, dialogs, webview partitions, session storage, find-in-page
- Build/packaging multiplataforma com installers gerados automaticamente
- Auto-update com **bsdiff** — patches diferenciais de ~14KB entre versões
- Suporte oficial: macOS 14+, Windows 11+, Ubuntu 22.04+
- ~11.4k stars, 40+ apps em produção reportados

### Webview por plataforma — crucial para compatibilidade CSS/JS

| Plataforma | Engine | Implicação |
|---|---|---|
| **macOS 14+** | WKWebView (Safari/WebKit) | Safari 17+ — suporta tudo que Tailwind v4 usa |
| **Windows 11+** | Edge WebView2 | **Chromium** — zero quirks |
| **Ubuntu 22.04+** | WebKitGTK 4.1 | WebKit — mesmas ressalvas do macOS |
| **Qualquer** | CEF (opt-in) | Chromium bundled — consistência total, +tamanho |

No caso específico deste projeto, a UI é renderizada via webview apontando para `http://localhost:PORT` — o SvelteKit continua servindo HTML/CSS/JS normalmente. Isso significa que o webview age como um browser comum, e Tailwind v4 (que já roda no Safari moderno sem issues) não terá problemas.

### Vantagem central para este projeto: Bun nativo no main process

Com Electrobun, o main process roda **diretamente em Bun**. Isso elimina o maior bloqueador da migração com Electron:

```typescript
// main.ts (Electrobun) — Bun nativo, sem shims
import { Bun } from 'bun';

const server = Bun.spawn(['bun', 'run', 'build/index.js'], {
  env: { ...process.env, PORT: String(port) }
});
```

Ou ainda mais limpo — importar e rodar o SvelteKit server diretamente no processo, já que Bun tem compatibilidade com `adapter-node`:

```typescript
// O build/index.js gerado pelo adapter-node roda com Bun
// sem `child_process.spawn` externo
```

### Bundle size
~12–16MB vs ~150MB do Electron. A maior parte do tamanho é o runtime Bun (~63MB descomprimido no macOS) — ainda assim significativamente menor que Electron.

### Limitações reais do Electrobun

1. **Maintainer solo** — o criador declarou explicitamente que não tem expectativa de revisar/mergear PRs externos. O projeto depende de uma pessoa. Risco real de abandono.
2. **Linux fora de Ubuntu**: distros sem WebKitGTK 4.1 são "out of scope" oficialmente.
3. **Windows 7 / W10 antigo**: Edge WebView2 requer W10 build 1803+. Windows 11 já tem built-in.
4. **Type definitions** atrasam a documentação em alguns casos (reportado na thread HN do lançamento).
5. **Ecossistema pequeno**: menos plugins, menos exemplos de integração, menos respostas prontas no Stack Overflow.

---

## 5. Mapeamento do custo de refatoração — este codebase

### 5.1 Caminhos de arquivo (ambos os frameworks)

Dois arquivos centralizam os paths:

**`ui/src/lib/server/db.ts:4`**
```typescript
// atual
const CLIENTS_DIR = path.resolve('../clients');

// desktop empacotado
const CLIENTS_DIR = path.join(app.getPath('userData'), 'clients');
// ou em Electrobun: usar uma API equivalente ou env var injetada pelo main process
```

**`lib/db/index.ts:16-17`**
```typescript
const DB_PATH        = path.resolve(__dir, '../../db/marketing.db');
const MIGRATION_PATH = path.resolve(__dir, '../../db/migrations/001_schema.sql');

// desktop: mover DB para userData, migrations vêm do bundle (read-only ok)
const DB_PATH = path.join(getDataDir(), 'marketing.db');
```

Impacto: **2 arquivos, mudança cirúrgica** — todos os outros arquivos que usam paths passam por essas duas funções centrais.

### 5.2 Variáveis de ambiente — o maior ponto de atenção

O projeto usa as seguintes env vars:

| Variável | Onde é lida | Onde é escrita |
|---|---|---|
| `GOOGLE_ADS_CLIENT_ID` | `googleAds.ts`, `googleAdsDetailed.ts`, `auth/+server.ts` | `.env` (manual) |
| `GOOGLE_ADS_CLIENT_SECRET` | idem | `.env` (manual) |
| `GOOGLE_ADS_DEVELOPER_TOKEN` | idem | `.env` (manual) |
| `GOOGLE_ADS_REFRESH_TOKEN` | idem | **`auth/google-ads/callback/+server.ts`** |
| `GOOGLE_ADS_LOGIN_CUSTOMER_ID` | idem | `.env` (manual) |
| `META_PAGE_ACCESS_TOKEN` | `publish-social-post.ts` | `.env` (manual) |
| `META_PAGE_ID` | idem | `.env` (manual) |
| `META_INSTAGRAM_ACCOUNT_ID` | idem | `.env` (manual) |
| `MEDIA_PUBLIC_BASE_URL` | idem | `.env` (manual) |

**Ponto crítico:** `ui/src/routes/api/auth/google-ads/callback/+server.ts` atualmente **escreve** o `GOOGLE_ADS_REFRESH_TOKEN` diretamente no arquivo `.env` após o fluxo OAuth. Em um app empacotado não existe `.env` gravável no diretório do bundle (fica em `.asar` read-only no Electron, ou equivalente no Electrobun).

**Solução:** Substituir a leitura/escrita de `.env` por uma camada de configuração persistente:

- **Electron**: `electron-store` com `safeStorage` (criptografa via keychain do OS)
- **Electrobun**: equivalente nativo ou um JSON em `userData` criptografado

A mudança afeta:
- `ui/src/routes/api/auth/google-ads/callback/+server.ts` — remover escrita no `.env`, escrever no config store
- `ui/src/lib/server/googleAds.ts` — trocar `env.GOOGLE_ADS_*` por leitura do config store
- `ui/src/lib/server/googleAdsDetailed.ts` — idem
- `scripts/lib/ads.ts` — `process.env.GOOGLE_ADS_*` → ler do JSON de config (scripts rodam como subprocessos)

**Estimativa:** 5–6 arquivos com mudanças localizadas. A abstração seria uma função `getConfig(key)` que lê do store; substituir `env.GOOGLE_ADS_CLIENT_ID` → `getConfig('GOOGLE_ADS_CLIENT_ID')` é mecânico.

### 5.3 Fluxo OAuth — sem copy-paste

O fluxo atual já usa localhost callback (`/api/auth/google-ads/callback`), o que é exatamente o que funciona em apps desktop. **Não precisa mudar nada no fluxo OAuth em si.** O que muda é só o destino do armazenamento do refresh token (ponto 5.2 acima).

Para o desktop: o main process abre o browser do sistema via `shell.openExternal(authUrl)` (Electron) ou equivalente no Electrobun. O SvelteKit server já está rodando internamente na porta aleatória e captura o callback normalmente.

### 5.4 Scripts de linha de comando

Scripts como `deploy-google-ads.ts`, `publish-social-post.ts`, `collect-daily-metrics.ts` — continuam rodando como subprocessos via `bun run script.ts`. No Electron, isso exige `bun` no PATH do sistema (é uma dependência externa). No Electrobun, o runtime Bun já está embutido — os scripts podem ser executados diretamente sem depender do Bun do sistema.

### 5.5 `better-sqlite3` — problema apenas no Electron

`lib/db/index.ts` tem fallback para `better-sqlite3` quando não está rodando com Bun:

```typescript
// lib/db/index.ts
// usa bun:sqlite em runtime Bun, better-sqlite3 caso contrário
```

Com Electrobun (Bun no main process), `bun:sqlite` é usado diretamente — **zero problema de addon nativo**. Com Electron (Node.js), `better-sqlite3` precisa de `electron-rebuild`. Esse é um dos maiores argumentos técnicos a favor do Electrobun para este projeto.

---

## 6. Tabela comparativa consolidada

| Critério | Electron | Electrobun |
|---|---|---|
| Runtime main process | Node.js | **Bun nativo** |
| Problema Bun→Node.js | Sim (shims necessários) | **Não existe** |
| `better-sqlite3` rebuild | Sim (electron-rebuild) | **Não necessário** (bun:sqlite) |
| Scripts `.ts` | `spawn('bun', ...)` externo | **Bun embutido** |
| Bundle size | ~150MB | **~12–16MB** |
| Webview Windows | Chromium (embutido) | Edge WebView2 (Chromium) |
| Webview macOS | Chromium (embutido) | WKWebView (WebKit) |
| CSS/JS compat | Perfeita (Chromium) | Boa (Safari 17+ / Edge) |
| Auto-update | Squirrel (maduro) | bsdiff patches (inovador) |
| Ecossistema | Enorme | Pequeno mas crescendo |
| Risco de abandono | Muito baixo | **Médio (maintainer solo)** |
| Code signing macOS | Burocrático | Resolvido no tooling |
| Multiplataforma | Windows/Mac/Linux sólido | Windows/Mac/Ubuntu oficial |
| Maturidade | 10+ anos | v1 fev/2026 |

---

## 7. Estimativa de esforço total

| Tarefa | Complexidade | Igual para ambos? |
|---|---|---|
| Main process boilerplate (janela, ciclo de vida) | Baixa | Não — APIs diferentes |
| Spawn do SvelteKit server | Baixa | Sim |
| Substituir paths hardcoded (2 arquivos) | Baixa | Sim |
| Camada de config store (BYOK) | Média | Não — electron-store vs solução Electrobun |
| Tela de Settings na UI para inserir chaves | Média | Sim |
| OAuth callback → gravar no config store | Baixa | Sim |
| `better-sqlite3` rebuild no CI | **Alta (Electron only)** | Não |
| Build pipeline (adapter-node + builder) | Média | Sim |
| Migração de dados existentes (first-run) | Baixa | Sim |

**Com Electron**: 3–5 dias funcional + 1–2 semanas build/packaging multiplataforma estável (especialmente o rebuild de melhor-sqlite3 no Windows).

**Com Electrobun**: 2–3 dias funcional + alguns dias de build/packaging. O tooling de build do Electrobun automatiza installers e updates nativamente.

---

## 8. Recomendação

**Para distribuição macOS + Windows: Electrobun é a escolha mais coerente com o stack.**

Os argumentos técnicos são fortes: Bun nativo elimina os dois maiores bloqueadores da migração (addon nativo do SQLite e compatibilidade de scripts). O projeto chega em v1 com tudo que é necessário para produção. Bundle menor é um bônus.

O único risco real é o maintainer solo. Mitigação: o projeto é open-source em Zig/Bun — se for abandonado, o framework pode ser forkado ou congelado numa versão funcional sem maiores problemas, já que a UI continua sendo SvelteKit padrão.

**Se Linux for requisito**: usar Electron. O suporte Linux do Electrobun é limitado a Ubuntu 22.04+ oficialmente.

**Se a preferência for risco zero**: usar Electron. Mais burocrático para este stack, mas nunca vai deixar de ser mantido.

---

## 9. Próximos passos (se decisão for Electrobun)

1. `bun add electrobun` no root do projeto
2. Criar `electron-main/main.ts` com boilerplate mínimo: janela + spawn do SvelteKit server
3. Criar camada `lib/config.ts` para leitura/escrita de configurações (substitui `.env`)
4. Atualizar `ui/src/lib/server/db.ts` e `lib/db/index.ts` para paths dinâmicos
5. Criar tela `/settings` na UI para inserir e testar as credenciais
6. Atualizar `auth/google-ads/callback/+server.ts` para gravar no config store
7. Configurar `adapter-node` build e wiring com o main process
8. Testar fluxo OAuth completo no app empacotado
9. Configurar build pipeline com installers e auto-update
