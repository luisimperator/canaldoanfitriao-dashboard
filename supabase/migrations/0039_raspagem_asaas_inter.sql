-- Raspagem Asaas → Inter: varre o saldo liquidado do Asaas pro Inter via Pix,
-- 3× ao dia, deixando um colchão. Miolo em src/lib/asaas-raspagem.ts.

-- 1) Log auditável: TODA tentativa vira linha aqui, inclusive as puladas.
--    É por esta tabela que a trava anti-duplicata sabe que já transferiu.
create table if not exists public.asaas_raspagens (
  id uuid primary key default gen_random_uuid(),
  criada_em timestamptz not null default now(),
  trigger text not null,                 -- cron | manual
  ok boolean not null,
  pulou boolean not null default false,
  motivo text,
  erro text,
  saldo numeric(14,2),                   -- saldo do Asaas antes da raspagem
  colchao numeric(14,2),
  piso numeric(14,2),
  valor numeric(14,2),                   -- transferido (null quando pulou)
  transfer_id text,
  transfer_status text,
  levou_ms integer
);
-- consulta quente da trava anti-duplicata: última transferência de fato
create index if not exists asaas_raspagens_transferidas_idx
  on public.asaas_raspagens (criada_em desc)
  where transfer_id is not null;
-- RLS sem policy: só a service role (que bypassa RLS) lê/escreve.
alter table public.asaas_raspagens enable row level security;

-- 2) Chave PRÓPRIA do cron da raspagem, separada da do sync: quem só lê
--    cobrança não deveria conseguir disparar saída de dinheiro.
do $$
begin
  if not exists (select 1 from vault.secrets where name = 'asaas_raspagem_key') then
    perform vault.create_secret(
      replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''),
      'asaas_raspagem_key',
      'Chave do cron que dispara a raspagem Asaas -> Inter'
    );
  end if;
end $$;

create or replace function public.asaas_raspagem_key()
returns text
language sql
stable
security definer
set search_path to 'public', 'vault'
as $$
  select decrypted_secret from vault.decrypted_secrets where name = 'asaas_raspagem_key';
$$;

-- 3) Três janelas por dia, em UTC (BRT = UTC-3). A última é 19h40 BRT, ANTES
--    das 20h, quando entra o limite noturno de Pix.
select cron.schedule('raspagem-asaas-manha', '21 11 * * *', $$
  select extensions.http_get(
    'https://painel.canaldoanfitriao.com.br/api/import/asaas-raspagem?key='
    || public.asaas_raspagem_key()
  )
$$);
select cron.schedule('raspagem-asaas-tarde', '0 18 * * *', $$
  select extensions.http_get(
    'https://painel.canaldoanfitriao.com.br/api/import/asaas-raspagem?key='
    || public.asaas_raspagem_key()
  )
$$);
select cron.schedule('raspagem-asaas-noite', '40 22 * * *', $$
  select extensions.http_get(
    'https://painel.canaldoanfitriao.com.br/api/import/asaas-raspagem?key='
    || public.asaas_raspagem_key()
  )
$$);

-- 4) Correção que a raspagem torna urgente: "Transferência entre contas
--    próprias" estava como RECEITA. O Pix da raspagem cai no extrato do Inter
--    com o nome da própria empresa e a regra de prioridade 25
--    ('%CANAL DO ANFITRIAO%') o joga nessa categoria — ou seja, todo dia o
--    nosso próprio dinheiro entraria como faturamento novo, inflando a Visão
--    geral. Dinheiro trocando de bolso não é receita: vira 'neutro', o mesmo
--    kind de aplicação e estorno (ver o cabeçalho de src/lib/dre.ts).
update public.fin_categories
set kind = 'neutro', group_name = 'Fora do resultado'
where slug = 'transferencia' and kind <> 'neutro';
