# Canal do Anfitrião — Dashboard

Dashboard que consolida num lugar só o que hoje está espalhado entre Eduzz,
Unnichat, Mailchimp, Meta Ads e Banco Inter.

## O que ele responde

| Tela | Pergunta que responde |
| --- | --- |
| **Visão geral** | Como estamos hoje? Vendas, leads, custo por venda e situação do caixa num olhar. |
| **Funil de vendas** | Quantos leads entram por dia? De onde vêm? Quantos viram quentes e quantos compram? Estamos melhores ou piores que o mês passado? |
| **Vendas & time** | Quanto cada vendedor vendeu hoje e no mês? Quantos leads um vendedor precisa para fechar uma venda? **O volume de leads atual sustenta a contratação de mais um vendedor?** |
| **Financeiro** | Entradas, saídas e resultado do mês, fluxo de caixa e despesas por categoria — com importação do extrato do Inter. |
| **Integrações** | O que já está conectado e o que falta. |

## Modo demonstração

Sem nenhuma configuração, o dashboard roda com **dados de exemplo realistas**
(um aviso amarelo indica isso). Serve para validar telas e métricas antes de
ligar os dados reais.

```bash
npm install
npm run dev
# abra http://localhost:3000
```

## Como os dados reais entram

```
Meta Ads / Google Ads ──► captação ──► Mailchimp ─┐
                                                  ├──► leads ──► Unnichat (CRM)
                                                  │              frio / lista de espera / quente
                                                  │                      │
Banco Inter ──► extrato ──► financeiro            │              vendedores (2)
                                                  │                      │
                                                  └──────────► venda na Eduzz
```

1. **Banco de dados (Supabase)** — guarda tudo. Aplique
   `supabase/migrations/0001_schema.sql` e preencha as variáveis no `.env.local`
   (modelo em `.env.example`).
2. **Eduzz** — cadastre o webhook `https://SEU_DOMINIO/api/webhooks/eduzz?key=...`
   para o evento de fatura paga. Cada venda entra sozinha no dashboard.
3. **Unnichat** — crie uma automação que chame
   `https://SEU_DOMINIO/api/webhooks/unnichat?key=...` quando o lead mudar de
   etapa no funil (o formato do envio está documentado na própria rota).
4. **Mailchimp** — a rotina de sincronização (`/api/sync/mailchimp`)
   importa inscritos novos como leads frios.
5. **Meta Ads** — `/api/sync/meta-ads` importa o gasto diário dos últimos 30 dias.
6. **Banco Inter** — enquanto a integração por API (`/api/sync/inter`) não é
   aprovada no banco, dá para subir o extrato OFX manualmente na tela Financeiro.

## A métrica de contratação

A pergunta-chave do negócio — *"dá para colocar mais um vendedor?"* — é
calculada assim:

- **Leads por venda** = leads captados nos últimos 30 dias ÷ vendas no período.
- **Capacidade de um vendedor** = melhor mês de um vendedor nos últimos 3 meses
  fechados (quantas vendas ele entrega quando tem lead).
- **Leads necessários para +1 vendedor** = capacidade × leads por venda.
- Se os leads atuais cobrem `(time atual + 1) × leads necessários`, o dashboard
  sinaliza ✅ *pode contratar*; perto disso, 🟡 *quase*; longe, 🔴 *falta lead*.
