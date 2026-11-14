-- Disparos pra alunos (Fernando, 14/11): cada onda sorteia N alunos ao acaso
-- (não a lista dos "mais prováveis"), pra comparar ondas e prever o resultado.
-- Aluno = comprou curso, imersão, ingresso de Encontro ou Airbnb do Zero
-- (mesma regra do Téo), tem telefone e não comprou a Black. Guarda quem foi
-- sorteado, o que recebeu e quando, pra medir resposta e venda depois.
create table if not exists public.campanha_alunos (
  id bigserial primary key,
  onda int not null,
  telefone text not null,
  email text,
  nome text,
  perfil text,             -- 'curso' (A5E/Gigantes/…) ou 'evento' (só imersão, Encontro ou Airbnb do Zero)
  produto text,            -- uma compra que dá a condição de aluno
  sorteado_em timestamptz not null default now(),
  excluido text,           -- motivo de não enviar (ex.: contato do Diego), se houver
  contact_id text,
  template text,
  enviado_em timestamptz,
  unique (onda, telefone)
);
comment on table public.campanha_alunos is
  'Ondas de disparo pra alunos, sorteadas ao acaso; resposta e venda saem cruzando com teo_conversas/sales depois.';
alter table public.campanha_alunos enable row level security;
