-- Avisos no celular em dois apps: o painel (ícone rosa) recebe venda; o app
-- "Agenda" (ícone azul, /calls/agenda) recebe só call agendada. No iPhone o
-- ícone do aviso é sempre o do app que assinou, então call com ícone diferente
-- só dá com um segundo app (Fernando, 18/11: "o ícone rosa que eu queria mudar").
-- Quem não instalou o Agenda continua recebendo call no painel.
alter table public.push_assinaturas
  add column if not exists canal text not null default 'vendas';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'push_assinaturas_canal_check') then
    alter table public.push_assinaturas
      add constraint push_assinaturas_canal_check check (canal in ('vendas', 'calls'));
  end if;
end $$;
