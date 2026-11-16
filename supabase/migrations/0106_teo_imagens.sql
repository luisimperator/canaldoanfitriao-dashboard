-- Téo vê imagem (16/11: "o Téo precisa identificar print"). Cada imagem da
-- conversa (do lead ou do time) é lida uma vez por uma IA com visão: o texto
-- que aparece (erro, valor, status) e o que a imagem mostra. A leitura fica
-- aqui pra não ler de novo a cada rodada, igual teo_audios. msg_id é o id da
-- mensagem no Unnichat; de = contact | user; sem texto e com 3 tentativas, o
-- Téo desiste e a imagem segue como "não deu pra abrir".
create table if not exists public.teo_imagens (
  msg_id text primary key,
  contact_id text,
  de text,
  texto text,
  erro text,
  tentativas int not null default 0,
  modelo text,
  entrada int,
  saida int,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index if not exists teo_imagens_contact on public.teo_imagens (contact_id);
alter table public.teo_imagens enable row level security;
