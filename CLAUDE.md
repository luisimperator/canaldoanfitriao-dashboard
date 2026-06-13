@AGENTS.md

# Canal do Anfitrião — Dashboard

Painel único que consolida o que hoje está espalhado entre **Eduzz** (vendas),
**Unnichat** (CRM/atendimento), **Mailchimp** (captação), **Meta Ads** (tráfego),
**Banco Inter** (financeiro) e **TMB** (pagamentos parcelados). O objetivo de
negócio central é responder *"o volume de leads atual já sustenta contratar
mais um vendedor?"*.

> ⚠️ **Antes de escrever código, leia `node_modules/next/dist/docs/`** (ver
> `AGENTS.md`). Este projeto usa **Next.js 16** com convenções que divergem do
> que você provavelmente conhece — em especial o middleware foi renomeado para
> **`proxy`** (ver `src/proxy.ts`).

## Stack

- **Next.js 16.2.9** (App Router) + **React 19.2** + **TypeScript** (strict).
- **Tailwind CSS v4** via `@tailwindcss/postcss` (sem `tailwind.config`; tudo no
  CSS — ver `src/app/globals.css`).
- **Supabase** (`@supabase/supabase-js`, `@supabase/ssr`) — Postgres + Auth.
- **Recharts 3** para gráficos (componentes client-side em `src/components/charts.tsx`).
- Import alias: **`@/*` → `./src/*`** (ver `tsconfig.json`).
- O idioma do produto, dos comentários e das mensagens de commit é
  **português (pt-BR)** — siga essa convenção.

## Comandos

```bash
npm install      # instala dependências
npm run dev      # servidor de desenvolvimento em http://localhost:3000
npm run build    # build de produção
npm run start    # serve o build
npm run lint     # eslint (flat config em eslint.config.mjs)
```

Não há suíte de testes no momento. Antes de concluir uma mudança, rode
`npm run lint` e, quando possível, `npm run build`.

## Modo demonstração (chave para entender o projeto)

Sem variáveis de ambiente do Supabase, o app roda 100% com **dados de exemplo
determinísticos** (`src/lib/demo-data.ts`, PRNG mulberry32 → estável entre
renders). Um banner amarelo (`DemoBanner`) avisa. Isso permite rodar e validar
todas as telas com `npm run dev` sem nenhuma configuração.

A decisão demo vs. real vive em **`src/lib/data.ts`**: `getDashboardData()`
checa `supabaseConfigured()` (presença de `NEXT_PUBLIC_SUPABASE_URL` +
`NEXT_PUBLIC_SUPABASE_ANON_KEY`) e ou lê do Supabase ou cai no gerador demo.
Qualquer tela nova deve consumir dados por essa função para herdar o modo demo
de graça.

## Estrutura

```
src/
  app/                      # App Router (todas as páginas são pt-BR, lang="pt-BR")
    layout.tsx              # shell: <Sidebar/> + <main>; fonte Geist; metadata
    page.tsx                # "/" Visão geral (KPIs, funil, origem, contratação)
    gargalo/page.tsx        # diagnóstico do maior freio do crescimento
    funil/page.tsx          # funil de vendas (entrada/qualificação/conversão)
    crm/page.tsx            # leads por etapa do pipeline do Unnichat
    vendas/page.tsx         # vendas por vendedor + análise de capacidade do time
    origem/page.tsx         # faturamento por canal (classifica UTMs da Eduzz)
    financeiro/page.tsx     # fluxo de caixa, despesas por categoria, upload de extrato
    integracoes/page.tsx    # status de cada integração + botão de sync
    login/page.tsx          # login Supabase (só quando Supabase configurado)
    api/
      webhooks/{eduzz,unnichat,tmb}/route.ts   # recebem eventos externos
      sync/{mailchimp,inter,meta-ads}/route.ts # sync sob demanda (POST)
      financeiro/upload/route.ts               # upload de extrato OFX/CSV
  components/
    Sidebar.tsx             # navegação (desktop lateral / mobile topo) — "use client"
    ui.tsx                  # PageHeader, Card, KpiCard, DemoBanner (server components)
    charts.tsx              # gráficos Recharts — "use client"
    SyncButton.tsx, UploadExtrato.tsx   # ações client-side
  lib/
    types.ts                # modelo de dados (espelha o schema SQL)
    data.ts                 # camada de acesso: Supabase OU demo
    demo-data.ts            # gerador determinístico de dados de exemplo
    metrics.ts              # TODOS os cálculos de métricas (ver abaixo)
    channels.ts             # classifyChannel(): UTM → canal legível
    format.ts               # brl(), num(), shortDate(), monthLabel() em pt-BR
    integrations/index.ts   # registro das integrações e seu status (env vars)
    supabase-admin.ts       # cliente service-role (só servidor; nunca no client)
  proxy.ts                  # "middleware" do Next 16: porteiro de auth
supabase/migrations/0001_schema.sql   # schema do banco (fonte da verdade)
.github/workflows/deploy-pages.yml    # publica a demo estática no GitHub Pages
```

## Convenções importantes

- **`proxy.ts`, não `middleware.ts`.** No Next 16 deste projeto o gate de
  requisições é `export function proxy(request)` + `export const config`. Ele
  redireciona para `/login` quando há Supabase configurado e não há sessão;
  libera `/api/webhooks/*` (validam a própria chave); em modo demo não faz nada.
- **Páginas são Server Components** e marcam `export const dynamic = "force-dynamic"`
  (leem dados a cada request). Componentes que usam Recharts, hooks ou eventos
  levam `"use client"` (`charts.tsx`, `Sidebar.tsx`, `SyncButton.tsx`,
  `UploadExtrato.tsx`).
- **Toda lógica de métrica fica em `src/lib/metrics.ts`** — as páginas só
  orquestram e formatam. Datas são strings ISO `YYYY-MM-DD`; helpers:
  `isoToday()`, `daysAgo(n)`, `monthKey()`, `inRange()`, `paidSales()`.
- **Formatação sempre via `src/lib/format.ts`** (`brl`, `num`) para manter o
  padrão pt-BR (R$, sem casas decimais por padrão).
- **`types.ts` usa camelCase; o Postgres usa snake_case.** O mapeamento
  acontece em `data.ts` (ex.: `created_at` → `createdAt`). Ao adicionar campos,
  atualize os três: migração SQL, `types.ts` e o `.map()` em `data.ts`.
- **Segurança Supabase:** RLS libera `select` para `anon` (leitura do dashboard);
  escrita só via **service role** em rotas de servidor
  (`getSupabaseAdmin()` em `supabase-admin.ts`). Nunca importe o cliente admin
  nem `SUPABASE_SERVICE_ROLE_KEY` em código client-side.

## Métricas centrais (`src/lib/metrics.ts`)

- **`capacityAnalysis()`** — a métrica-chave do negócio. Leads/venda (30d) ×
  capacidade do vendedor mais produtivo (melhor mês nos 3 meses fechados,
  ignorando vendas sem vendedor) → quantos vendedores o volume de leads
  sustenta. Veredito: `pode_contratar` / `quase` / `falta_lead` / `sem_dados`.
- **`bottleneckAnalysis()`** — compara últimos 30d com os 30 anteriores e pontua
  4 freios (geração de leads, conversão, capacidade do time, eficiência de
  mídia/CAC); o maior score é o gargalo da tela `/gargalo`.
- **`sellerStats()`**, **`funnelStages()`**, **`dailyLeadSeries()`** (média móvel
  7d), **`monthlyCashflow()`**, **`spendByCategory()`**.

## Integrações e fluxo de dados

```
Meta Ads ─► captação ─► Mailchimp ─┐
                                   ├─► leads ─► Unnichat (CRM) ─► vendedores ─► venda Eduzz
Banco Inter ─► extrato ─► financeiro┘                                              │ TMB (parcelado)
```

Cada integração é ativada por env vars e listada em
`src/lib/integrations/index.ts` (com `configured`, `howItWorks`, `syncPath`).
A tela `/integracoes` lê esse registro — **ao adicionar uma integração,
registre-a ali**.

| Integração | Como entra | Env vars |
| --- | --- | --- |
| Supabase | banco de dados (sem ele → modo demo) | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` |
| Eduzz | webhook `POST /api/webhooks/eduzz?key=` (fatura paga/reembolso) | `EDUZZ_WEBHOOK_KEY` |
| Unnichat | webhook `POST /api/webhooks/unnichat?key=` (mudança de etapa) | `UNNICHAT_WEBHOOK_KEY` |
| TMB | webhook `POST /api/webhooks/tmb?key=` (hoje só loga em `webhook_log`) | `TMB_WEBHOOK_KEY` |
| Meta Ads | sync `POST /api/sync/meta-ads` (gasto diário 30d via Graph API) | `META_ADS_ACCESS_TOKEN`, `META_ADS_ACCOUNT_ID` |
| Mailchimp | sync `POST /api/sync/mailchimp` (novos inscritos → leads frios) | `MAILCHIMP_API_KEY`, `MAILCHIMP_LIST_ID` |
| Banco Inter | sync `POST /api/sync/inter` (extrato mTLS) ou upload OFX/CSV manual | `INTER_CLIENT_ID`, `INTER_CLIENT_SECRET`, `INTER_CERT_PEM`, `INTER_KEY_PEM` |

**Padrão das rotas de servidor:** webhooks exigem `?key=` igual à env var
(401 se inválida, 501 se a env/Supabase não está configurada) e respondem
`200 {ok:true, action:"ping"}` a pings de verificação sem corpo; usam
`upsert` com chave de deduplicação (`eduzz_invoice_id`, `external_id`,
`(date,platform,campaign)`) para não duplicar. Eventos crus são gravados em
`webhook_log` para diagnóstico.

> Nota: a tabela `webhook_log` é usada pelas rotas mas **não está em
> `0001_schema.sql`** — crie-a no Supabase (ou adicione uma migração) ao
> habilitar os webhooks. Não existe `.env.example` versionado.

## Banco de dados

`supabase/migrations/0001_schema.sql` é a fonte da verdade do schema:
`sellers`, `leads`, `sales`, `ad_spend`, `fin_categories`, `fin_source_files`,
`fin_transactions` — todas com RLS (leitura `anon`, escrita service-role) e
índices por data/status. Há um cliente MCP do Supabase disponível nesta sessão
para inspecionar/migrar o projeto remoto quando necessário.

## Deploy

`.github/workflows/deploy-pages.yml` publica uma **demo estática** no GitHub
Pages a cada push em `main`. O job remove `src/app/api` e as linhas
`force-dynamic` apenas durante o build (o código real fica intacto) e publica
`./out` em `gh-pages` — o site servido roda sempre em modo demo. O app completo
(com APIs e SSR) é pensado para um host com servidor (ex.: Vercel).

## Git / workflow desta sessão

- Branch de trabalho: `claude/claude-md-docs-w9mxc3`. Faça commits descritivos
  em pt-BR e abra um **PR em rascunho** após o push.
- Não inclua identificadores de modelo em commits, código ou PRs.
