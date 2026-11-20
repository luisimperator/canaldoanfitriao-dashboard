-- Canal direto painel <-> Foley (Fernando, 20/11: "To cansado de ser garoto de
-- recados de vcs. Não conseguem conversar não?").
--
-- foley_recados: caixa de recados nos dois sentidos. O Foley manda status e
-- dúvidas (POST /api/foley/recados, de = 'foley'); o painel (o Claude, por SQL)
-- deixa recados pro Foley (de = 'painel'), que ele busca no GET da mesma rota.
--
-- foley_saidas: quem o robô tirou do grupo e por quê (POST /api/foley/saidas).
-- O painel manda o template saida_aviso (Utilidade, aprovado em 20/11) pra
-- pessoa; quem saiu por reembolso/chargeback não recebe (a mensagem diz "não
-- foi renovado"). Uma linha por pessoa/grupo/dia: repetir o aviso não manda
-- de novo.

create table if not exists public.foley_recados (
  id bigserial primary key,
  criado_em timestamptz not null default now(),
  de text not null check (de in ('painel', 'foley')),
  assunto text,
  texto text not null,
  lido_em timestamptz
);
alter table public.foley_recados enable row level security;
create index if not exists foley_recados_pendentes on public.foley_recados (de, lido_em, criado_em);

create table if not exists public.foley_saidas (
  id bigserial primary key,
  criado_em timestamptz not null default now(),
  chave text not null unique,
  telefone text not null,
  nome text,
  grupo text not null check (grupo in ('a5e', 'gigantes')),
  motivo text,
  removido_em timestamptz not null,
  aviso_status text not null default 'pendente',
  aviso_em timestamptz,
  aviso_detalhe text,
  payload jsonb
);
alter table public.foley_saidas enable row level security;
create index if not exists foley_saidas_removido on public.foley_saidas (removido_em desc);

-- Recado de boas-vindas pro Foley, que ele lê no primeiro GET.
insert into public.foley_recados (de, assunto, texto) values (
  'painel',
  'Canal direto e pausa',
  'Oi, Foley. Daqui pra frente a gente conversa por aqui, sem o Fernando no meio: mande status e dúvidas em POST /api/foley/recados e leia os meus no GET da mesma rota. '
  || 'Sobre o "pausado": é decisão do Fernando (20/11, ~12h). As remoções estão pausadas até o saida_aviso ser enviado pelo painel. Quando o /api/foley/situacao responder "pausado", não tire a pessoa; a decisão da regra vem em decisao_regra. Eu aviso aqui quando despausar. '
  || 'Quem você tirar do grupo, mande em POST /api/foley/saidas (formato no recado seguinte): o painel manda o saida_aviso pra pessoa. As 3 saídas de 20/11 às 11h (José, Vinicius, Maurício) podem ser mandadas lá também.'
);
insert into public.foley_recados (de, assunto, texto) values (
  'painel',
  'Formato do POST /api/foley/saidas',
  'Authorization: Bearer <FOLEY_API_TOKEN> (o mesmo da situação). Corpo: {"pessoas": [{"telefone": "5511...", "nome": "José Sousa", "grupo": "a5e" | "gigantes", "motivo": "assinatura cancelada", "removido_em": "2026-11-20T11:00:00-03:00"}]}. '
  || 'Resposta, na mesma ordem: aviso = enviado | ja_registrado | sem_aviso (reembolso/chargeback) | erro, com o detalhe. Repetir a mesma pessoa/grupo/dia não manda o aviso duas vezes.'
);
