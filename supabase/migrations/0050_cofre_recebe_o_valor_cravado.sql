-- Cofre: quem grava é o dia 9, não a prévia do dia 1.
--
-- A linha do mês em `reserva_mensal` era escrita duas vezes, por funções
-- diferentes, e a errada ganhava:
--
--   dia 1, 06h10  rodar_politica_mensal() → fechar_reserva_mes()
--                 grava a PRÉVIA, com o caixa do primeiro dia do mês
--                 (on conflict do update — sempre sobrescreve)
--
--   dia 9         distribuicao_fechar() crava a distribuição e tenta gravar
--                 o valor REAL — mas com `on conflict (mes) do nothing`.
--                 A linha já existe. Não faz nada.
--
-- Nove dias separam as duas, e o caixa muda nesses nove dias. O que sai da
-- mão dos sócios é calculado no dia 9; o que entra no cofre ficou congelado
-- no dia 1. A diferença não vai pra lugar nenhum: não é distribuída e não é
-- creditada — fica solta na conta.
--
-- Setembro/2026: prévia de R$ 6.743,73 gravada em 01/09, quando o saldo do
-- Asaas ainda estava invisível pra política (ver 0049 e a restauração da
-- raspagem). O valor real do dia 9 é R$ 11.721,55. Some R$ 4.977,82.
--
-- Agosto/2026 foi igual, por outro caminho: o fechamento foi recravado à mão
-- em 09/08 e, como a linha do fechamento já existia, o `if found` barrou o
-- crédito. O cofre ficou com a prévia de R$ 17.730,31 enquanto a distribuição
-- cravada (R$ 111.000) implica algo perto de R$ 19.600.
--
-- Efeito acumulado: o cofre está subestimado desde que existe, o colchão
-- junto, e a distribuição saiu MAIOR do que a política pretendia. Dois meses
-- de vida, duas vezes errado — é sistemático, não azar.
--
-- O conserto é `do update` no lugar de `do nothing`. A trava contra crédito
-- em dobro continua sendo o `if found` logo acima: ele só é verdadeiro quando
-- o INSERT em distribuicao_fechamento criou linha nova, ou seja, uma vez por
-- competência. Reexecutar a função segue não creditando nada.
--
-- Agosto NÃO é corrigido aqui de propósito: reconstruir o valor exigiria
-- refazer a política com o caixa de 09/08, que não existe mais. Dá pra
-- estimar pelo valor cravado (R$ 111.000 ÷ 0,85 × 0,15 ≈ R$ 19.588), mas
-- estimativa não entra em livro de dinheiro sem alguém decidir.

create or replace function public.distribuicao_fechar(p_ref date default current_date, p_por text default 'auto')
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_st jsonb; v_pol jsonb;
  v_comp date; v_data date; v_valor numeric;
  v_cofre numeric; v_pct numeric; v_desp numeric;
begin
  v_st := distribuicao_status(p_ref);
  v_pol := v_st->'politica';
  v_comp := (v_st->>'competencia')::date;
  v_data := (v_st->>'data_distribuicao')::date;
  v_valor := (v_st->>'valor_vivo')::numeric;
  v_cofre := coalesce((v_pol->>'vai_pro_cofre')::numeric, 0);
  v_pct := coalesce((v_pol->>'percentual_reserva')::numeric, 0);
  v_desp := coalesce((v_pol->>'despesa_total_mes')::numeric, 0);

  insert into distribuicao_fechamento (competencia, data_distribuicao, valor, fechado_por)
  values (v_comp, v_data, v_valor, p_por)
  on conflict (competencia) do nothing;

  -- só credita o cofre se o fechamento é novo (evita dobrar em re-execução)
  if found and v_cofre > 0 then
    insert into reserva_mensal (mes, despesas_previstas, percentual, valor)
    values (v_comp, v_desp, v_pct, v_cofre)
    -- A prévia do dia 1 existe e está velha: o valor do fechamento manda.
    on conflict (mes) do update
      set despesas_previstas = excluded.despesas_previstas,
          percentual         = excluded.percentual,
          valor              = excluded.valor;
  end if;

  return distribuicao_status(p_ref);
end;$function$;
