-- Caixa de entrada do suporte (WhatsApp oficial).
--
-- support_messages ganha tipo/mídia/status; support_conversas é o estado por
-- número (não lidas, IA ligada, janela de 24h, quem atende). A conversa é
-- mantida por trigger — assim webhook e painel não precisam lembrar de
-- atualizar duas tabelas.

alter table public.support_messages
  add column if not exists tipo text not null default 'text',
  add column if not exists media_id text,
  add column if not exists media_path text,
  add column if not exists media_mime text,
  add column if not exists autor text not null default 'cliente',  -- cliente | ia | humano
  add column if not exists wa_status text;                          -- sent|delivered|read|failed

create table if not exists public.support_conversas (
  wa_phone text primary key,
  nome text,
  ultimo_texto text,
  ultimo_em timestamptz,
  -- última mensagem DO CLIENTE: define a janela de 24h da Meta
  ultima_entrada_em timestamptz,
  nao_lidas int not null default 0,
  ia_ativa boolean not null default true,
  status text not null default 'aberta',      -- aberta | resolvida
  atendente text,
  criado_em timestamptz not null default now()
);
alter table public.support_conversas enable row level security;

create index if not exists support_conversas_ultimo_idx
  on public.support_conversas (ultimo_em desc);

-- Resumo de uma mensagem pra lista de conversas (mídia não tem texto).
create or replace function public.support_resumo(p_tipo text, p_text text)
returns text language sql immutable as $$
  select coalesce(nullif(trim(coalesce(p_text, '')), ''),
    case p_tipo
      when 'image' then '📷 Imagem'
      when 'audio' then '🎤 Áudio'
      when 'video' then '🎬 Vídeo'
      when 'document' then '📄 Documento'
      when 'sticker' then 'Figurinha'
      when 'location' then '📍 Localização'
      else '(sem texto)'
    end);
$$;

create or replace function public.support_touch_conversa()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  insert into support_conversas (wa_phone, ultimo_texto, ultimo_em, ultima_entrada_em, nao_lidas)
  values (
    new.wa_phone,
    support_resumo(new.tipo, new.text),
    new.created_at,
    case when new.direction = 'in' then new.created_at else null end,
    case when new.direction = 'in' then 1 else 0 end
  )
  on conflict (wa_phone) do update set
    ultimo_texto = support_resumo(new.tipo, new.text),
    ultimo_em = new.created_at,
    ultima_entrada_em = case when new.direction = 'in' then new.created_at
                             else support_conversas.ultima_entrada_em end,
    nao_lidas = case when new.direction = 'in' then support_conversas.nao_lidas + 1
                     else support_conversas.nao_lidas end,
    -- resposta humana reabre a conversa; ela só volta a 'resolvida' na mão
    status = case when new.direction = 'in' then 'aberta' else support_conversas.status end;
  return new;
end;$$;

drop trigger if exists support_messages_touch on public.support_messages;
create trigger support_messages_touch
  after insert on public.support_messages
  for each row execute function public.support_touch_conversa();

-- Bucket privado pra mídia recebida (print de comprovante, áudio).
insert into storage.buckets (id, name, public)
values ('whatsapp', 'whatsapp', false)
on conflict (id) do nothing;
