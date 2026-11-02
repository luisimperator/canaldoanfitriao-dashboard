-- Téo: agente de vendas no WhatsApp (via Unnichat).
--
-- Versão 1: a rota /api/sync/teo roda a cada minuto, olha as conversas
-- inscritas em teo_conversas, e quando a última mensagem é do lead, o Claude
-- responde pela API do Unnichat. O token do Unnichat fica no vault; o servidor
-- chama a API por teo_unnichat(), que só aceita os caminhos de que o Téo
-- precisa.

create table if not exists public.teo_conversas (
  contact_id text primary key,
  nome text,
  telefone text,
  -- novo: ainda não abriu a conversa | em_conversa | humano: passou pro time | encerrado
  estado text not null default 'novo',
  ativo boolean not null default true,
  -- id da última mensagem do lead que o Téo já tratou (pra não responder duas vezes)
  ultima_msg_tratada text,
  ultima_resposta_em timestamptz,
  respostas int not null default 0,
  lock_ate timestamptz,
  ficha text,
  motivo_humano text,
  erro text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
alter table public.teo_conversas enable row level security;

create table if not exists public.teo_config (
  id int primary key default 1 check (id = 1),
  -- botão de desligar: false = o Téo não manda nada pra ninguém
  ligado boolean not null default true,
  -- inscreve sozinho os leads novos da Lista de Espera (fora da Black) até esta hora
  auto_inscrever_ate timestamptz,
  -- aviso do dia que vai no prompt (feriado, horário do time etc.)
  contexto text not null default '',
  max_respostas int not null default 30,
  atualizado_em timestamptz not null default now()
);
alter table public.teo_config enable row level security;
insert into public.teo_config (id) values (1) on conflict (id) do nothing;

-- Trava por conversa: só uma execução responde por vez.
create or replace function public.teo_lock(p_contact text, p_segundos int default 120)
returns boolean
language sql
security definer
set search_path to 'public'
as $$
  with pegou as (
    update teo_conversas
       set lock_ate = now() + make_interval(secs => p_segundos)
     where contact_id = p_contact
       and (lock_ate is null or lock_ate < now())
    returning 1
  )
  select exists (select 1 from pegou);
$$;

create or replace function public.teo_unlock(p_contact text)
returns void
language sql
security definer
set search_path to 'public'
as $$
  update teo_conversas set lock_ate = null, atualizado_em = now() where contact_id = p_contact;
$$;

-- Ponte para a API do Unnichat com o token do vault. Só os caminhos do Téo:
--   GET  /contact/{id}            perfil
--   GET  /contact/{id}/messages   histórico
--   POST /contact/{id}/notes      nota interna (ficha pro vendedor)
--   POST /meta/messages           mensagem de texto
--   POST /meta/templates          template (janela de 24h fechada)
create or replace function public.teo_unnichat(p_method text, p_path text, p_body jsonb default null)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $$
declare
  v_tok text;
  v_status int;
  v_content text;
  v_ok boolean;
begin
  v_ok := (p_method = 'GET' and p_path ~ '^/contact/[A-Za-z0-9-]+(/messages)?$')
       or (p_method = 'POST' and (p_path ~ '^/contact/[A-Za-z0-9-]+/notes$' or p_path in ('/meta/messages', '/meta/templates')));
  if not v_ok then
    return jsonb_build_object('status', 400, 'erro', 'caminho não permitido');
  end if;
  select decrypted_secret into v_tok from vault.decrypted_secrets where name = 'unnichat_api_token';
  if v_tok is null then
    return jsonb_build_object('status', 500, 'erro', 'sem token');
  end if;
  perform extensions.http_set_curlopt('CURLOPT_TIMEOUT_MS', '15000');
  select status, content into v_status, v_content
    from extensions.http((
      p_method,
      'https://unnichat.com.br/api' || p_path,
      array[
        extensions.http_header('Authorization', 'Bearer ' || v_tok),
        extensions.http_header('Accept', 'application/json')
      ],
      case when p_body is null then null else 'application/json' end,
      case when p_body is null then null else p_body::text end
    )::extensions.http_request);
  begin
    return jsonb_build_object('status', v_status, 'body', v_content::jsonb);
  exception when others then
    return jsonb_build_object('status', v_status, 'body', to_jsonb(left(coalesce(v_content, ''), 2000)));
  end;
end;
$$;

revoke all on function public.teo_lock(text, int) from public, anon, authenticated;
revoke all on function public.teo_unlock(text) from public, anon, authenticated;
revoke all on function public.teo_unnichat(text, text, jsonb) from public, anon, authenticated;
grant execute on function public.teo_lock(text, int) to service_role;
grant execute on function public.teo_unlock(text) to service_role;
grant execute on function public.teo_unnichat(text, text, jsonb) to service_role;
