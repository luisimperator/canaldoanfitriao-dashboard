-- O feedback de cada call vai pro vendedor no privado E pro grupo "Gestão
-- Comercial" no WhatsApp (Fernando, 19/11: "manda pro vendedor e manda também
-- pro grupo gestão comercial"). Cada destino tem a sua marca de entrega, pro
-- OpenClaw nunca mandar duas vezes nem deixar um dos dois pra trás.
alter table public.call_feedbacks
  add column if not exists entregue_grupo_em timestamptz,
  add column if not exists entrega_grupo_detalhe text;

drop index if exists public.call_feedbacks_pendentes;
create index if not exists call_feedbacks_pendentes
  on public.call_feedbacks (gerado_em)
  where status = 'pronto' and (entregue_em is null or entregue_grupo_em is null);
