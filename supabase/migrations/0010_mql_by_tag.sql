-- NOVO critério de MQL: contato que recebeu uma das tags lead-a5e,
-- lead-gigantes, lead-quente ou lead-muito-quente. O momento em que vira MQL é
-- o momento em que a TAG chega (lead_events), não mais a atribuição a
-- vendedor. leads.mql_at materializa isso; um trigger mantém daqui pra frente.

alter table public.leads add column if not exists mql_at timestamptz;

create or replace function public.is_mql_tags(p_tags text)
returns boolean language sql immutable as $$
  select coalesce(p_tags ~* '(^|, )lead-(a5e|gigantes|quente|muito-quente)(,|$)', false);
$$;

-- Backfill: 1o evento com tag de MQL por contato.
with first_mql as (
  select unnichat_id, min(event_at) as mql_at
  from public.lead_events
  where public.is_mql_tags(tags)
  group by unnichat_id
)
update public.leads l
set mql_at = f.mql_at
from first_mql f
where l.unnichat_id = f.unnichat_id
  and (l.mql_at is null or l.mql_at > f.mql_at);

-- Daqui pra frente: todo evento novo com tag de MQL carimba o lead (mantendo a
-- data mais antiga).
create or replace function public.stamp_mql_at()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if public.is_mql_tags(new.tags) then
    update public.leads
    set mql_at = least(coalesce(mql_at, new.event_at), new.event_at)
    where unnichat_id = new.unnichat_id;
  end if;
  return new;
end;$$;

drop trigger if exists trg_stamp_mql_at on public.lead_events;
create trigger trg_stamp_mql_at
  after insert on public.lead_events
  for each row execute function public.stamp_mql_at();

-- Fluxo de MQL passa a contar pelo novo critério/momento.
create or replace function public.mql_new_daily(p_days int default 90)
returns table(day date, mql bigint)
language sql stable security definer
set search_path = public
as $$
  select mql_at::date as day, count(*)::bigint as mql
  from public.leads
  where mql_at is not null
    and mql_at::date > current_date - p_days
  group by 1
  order by 1;
$$;
