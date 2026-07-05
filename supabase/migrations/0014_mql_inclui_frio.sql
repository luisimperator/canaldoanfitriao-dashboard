-- MQL passa a incluir lead-frio (decisão do Luis, 05/07): o estudo de
-- conversão mostrou frio comprando curso a ~4% — vale atendimento. O
-- lead-muito-frio segue FORA (0% de conversão medida). O regex não casa
-- "lead-muito-frio" no ramo "frio" porque exige o hífen logo após "lead-".
create or replace function public.is_mql_tags(p_tags text)
returns boolean language sql immutable as $$
  select coalesce(p_tags ~* '(^|, )lead-(a5e|gigantes|quente|muito-quente|frio)(,|$)', false);
$$;

-- Re-backfill: carimba/adianta mql_at considerando o novo conjunto de tags.
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
