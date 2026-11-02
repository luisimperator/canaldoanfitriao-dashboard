-- Téo: os vendedores atendem em paralelo, então o mesmo horário aceita uma
-- call por vendedor (antes era uma call por horário).
drop index if exists public.teo_calls_horario_unico;
create unique index if not exists teo_calls_horario_vendedor_unico
  on public.teo_calls (inicio, vendedor) where status <> 'cancelada';
