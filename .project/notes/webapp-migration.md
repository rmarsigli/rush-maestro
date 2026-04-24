# Maestro — Migrar para Web App

Transformar o sistema atual num produto SaaS para agências de performance.

---

## Premissa

O que existe hoje prova o conceito: coleta automática de métricas, alertas inteligentes,
relatórios gerados por IA. O diferencial não é o dashboard — é a IA integrada ao fluxo
operacional. Ferramentas como Data Studio e Reportei mostram dados. Maestro age sobre eles.

---

## Stack Proposta

```
Frontend:  SvelteKit (já existente, adaptar)
Backend:   Go (API REST + workers de coleta)
Banco:     PostgreSQL (migração direta do schema SQLite atual)
Auth:      Google OAuth2 (resolve o fluxo de autorização do Google Ads)
IA:        Anthropic API (relatórios sob demanda + alertas com análise)
Scheduler: interno (gocron) — configurável via UI por tenant
```

---

## Por que Go no backend

- Scheduler interno com `gocron` — sem crontab manual, configurável via UI
- Worker pool para coleta paralela de N tenants via goroutines
- `golang.org/x/oauth2` cuida do refresh token do Google Ads automaticamente
- Performance e baixo custo de infra em produção

---

## Arquitetura

```
UI (SvelteKit) ──→ API REST (Go) ──→ PostgreSQL
                         │
                         ├──→ Google Ads API  (worker pool, por tenant)
                         ├──→ Meta Graph API  (worker pool, por tenant)
                         ├──→ Anthropic API   (relatórios + análise de alertas)
                         └──→ Mailer          (envio automático de relatórios)
```

---

## O que muda vs. o sistema atual

| Hoje (local)                         | Webapp                                        |
|--------------------------------------|-----------------------------------------------|
| Crontab manual no WSL                | Scheduler configurável na UI por tenant        |
| `.env` com credenciais manuais       | OAuth2 — agência autoriza via UI              |
| Relatório gerado manualmente         | Gerado automaticamente + enviado por email     |
| Um tenant (Pórtico)                  | Multi-tenant isolado com auth por API key/JWT  |
| Claude Code local                    | Anthropic API chamada pelo backend Go          |
| SQLite gitignored                    | PostgreSQL gerenciado                         |

---

## Diferenciais de Produto

**Relatório executivo automático** — toda segunda-feira, o cliente da agência recebe
um email com análise da semana escrita em linguagem executiva, não em tabela.
Gerado por IA com os dados reais da campanha. Sem trabalho manual da agência.

**Alertas com análise** — não só "CPA subiu 40%", mas "CPA subiu porque o ad group
Reforma Apartamento perdeu impression share — sugestão: aumentar lance em R$0,30".

**Aprovação inline** — agência propõe ajuste de campanha via UI, cliente aprova
com um clique, sistema executa via API. Fim do WhatsApp de vai-e-vem.

---

## Modelo de Negócio

**B2B2C** — vender para a agência, que usa como diferencial com os clientes dela.

- Ticket maior que B2C direto
- Churn menor (agência não cancela ferramenta que usa com cliente ativo)
- Sem necessidade de volume enorme para ser lucrativo

**Referência de preço:** Reportei cobra ~R$150/tenant/mês sem IA.
Com a proposta de valor atual: R$400–600/tenant/mês ou plano por agência (N tenants incluídos).

---

## Riscos a não subestimar

**Onboarding OAuth** — cada cliente novo da agência precisa autorizar o acesso
ao Google Ads. O fluxo técnico é resolvido, a fricção operacional (convencer o cliente
a clicar no botão) precisa ser suave.

**Qualidade da IA em escala** — relatório gerado para 50 tenants precisa de um
mecanismo de revisão ou aprovação antes de enviar para o cliente final.
Um relatório ruim entregue automaticamente é pior que nenhum relatório.

**Suporte** — quando a campanha vai mal, o cliente liga pra agência, a agência
liga pra você. Definir SLA e limites de responsabilidade antes de lançar.

---

## Go-to-market sugerido

1. **Usar internamente** — maturar o produto com os próprios clientes (já em andamento)
2. **Beta fechado** — 2–3 agências parceiras, sem custo, com suporte próximo
3. **Validar precificação** — entender o que a agência valoriza de fato antes de escalar
4. **Lançamento público** — só após ter NPS positivo e churn < 5% no beta

---

## Migração do schema atual

O schema SQLite já está bem modelado. Migração direta para PostgreSQL:

```sql
-- daily_metrics, monthly_summary, alert_events, agent_runs
-- Adicionar: tenant_id (FK), user_id, created_by
-- Adicionar: tabela accounts (agências) e users
-- Adicionar: tabela oauth_tokens (Google Ads por tenant)
-- Adicionar: tabela schedules (configuração de cron por tenant)
```

---

## Próximos passos (quando decidir avançar)

- [ ] Definir se é SaaS público, white-label ou produto interno
- [ ] Prototipar o fluxo de onboarding OAuth com uma agência parceira
- [ ] Decidir hosting (Railway, Fly.io, VPS próprio)
- [ ] Estimar custo de infra para 10 / 50 / 200 tenants
- [ ] Definir mecanismo de revisão de relatórios antes do envio automático
