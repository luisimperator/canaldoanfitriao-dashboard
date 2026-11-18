-- Templates do disparo pros alunos numa tabela (letra -> template da Meta e o
-- texto que fica gravado em campanha_alunos.mensagem), pra testar abertura nova
-- sem mexer na função: basta inserir a letra quando a Meta aprovar.
-- Fernando, 18/11: "Testa: quantos imóveis vc administra hoje no Airbnb?" (F).
-- {nome} vira o primeiro nome (ou "tudo bem" pra empresa).
create table if not exists public.campanha_templates (
  letra text primary key,
  template_id text not null,
  mensagem text not null,
  criado_em timestamptz not null default now()
);
alter table public.campanha_templates enable row level security;

insert into public.campanha_templates (letra, template_id, mensagem) values
  ('D', '1193181226981059', 'Oi, {nome}! O Rômulo liberou uma condição só pra quem já é ou foi aluno dele. Posso te mandar?'),
  ('E', '1696092268823081', 'Oi, {nome}! Pergunta rápida: quantos imóveis você tem hoje? Tenho uma coisa pra te mostrar que depende da sua resposta.')
on conflict (letra) do nothing;

create or replace function public.campanha_enviar_onda(p_onda integer, p_lote integer default 25)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  t record;
  j jsonb;
  pn text;
  ok boolean;
  n_ok integer := 0;
  n_falha integer := 0;
begin
  if extract(hour from now() at time zone 'America/Sao_Paulo') < 8
     or extract(hour from now() at time zone 'America/Sao_Paulo') >= 21 then
    raise exception 'fora do horário de iniciativa (8h às 21h)';
  end if;
  for r in
    select id, telefone, template, contact_id, nome from campanha_alunos
     where onda = p_onda and enviado_em is null and excluido is null and contact_id is not null
     order by id limit p_lote
  loop
    select * into t from campanha_templates where letra = r.template;
    if t.template_id is null then
      update campanha_alunos set excluido = 'template sem cadastro: ' || coalesce(r.template, '?') where id = r.id;
      n_falha := n_falha + 1;
      continue;
    end if;
    pn := case when r.nome ~* '(ltda|leil|associad|administra|residencial|eireli|imob)' then 'tudo bem'
               else initcap(split_part(regexp_replace(trim(coalesce(r.nome, '')), '\s+', ' ', 'g'), ' ', 1)) end;
    if coalesce(pn, '') = '' then pn := 'tudo bem'; end if;
    j := public.teo_unnichat('POST', '/meta/templates', jsonb_build_object(
      'phone', r.telefone,
      'templateId', t.template_id,
      'bodyParameters', jsonb_build_array(jsonb_build_object('type', 'text', 'text', pn))));
    ok := coalesce((j->>'status')::int, 0) between 200 and 299;
    update campanha_alunos set
      enviado_em = case when ok then now() else null end,
      mensagem = case when ok then replace(t.mensagem, '{nome}', pn) else null end,
      excluido = case when ok then null else 'envio falhou: ' || coalesce(j->>'status', '?') || ' ' || left((j->'body')::text, 200) end
     where id = r.id;
    insert into webhook_log (source, note, body)
    values ('teo', 'disparo onda ' || p_onda || ' (' || r.template || ')' || case when ok then '' else ' FALHOU' end,
            jsonb_build_object('campanha_id', r.id, 'contact_id', r.contact_id, 'nome', r.nome, 'telefone', r.telefone,
                               'status', j->>'status', 'resposta', j->'body'));
    if ok then n_ok := n_ok + 1; else n_falha := n_falha + 1; end if;
  end loop;
  return jsonb_build_object('enviados', n_ok, 'falhas', n_falha,
    'faltam', (select count(*) from campanha_alunos where onda = p_onda and enviado_em is null and excluido is null and contact_id is not null));
end;
$$;

revoke all on function public.campanha_enviar_onda(integer, integer) from public, anon, authenticated;
grant execute on function public.campanha_enviar_onda(integer, integer) to service_role;
