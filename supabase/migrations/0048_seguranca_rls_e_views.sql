-- Segurança: fecha o que o Security Advisor apontou como erro.
--
-- Dois problemas, de origens diferentes.
--
-- 1) DUAS TABELAS PÚBLICAS SEM RLS
--
-- Os retratos tirados antes da deduplicação de leads (0046) foram criados com
-- `create table as select`, que copia os dados mas NÃO liga RLS. Ficaram sendo
-- as duas únicas tabelas públicas do projeto sem proteção — 41 outras tinham —
-- expondo 46.065 leads com nome, e-mail e telefone a leitura E escrita por
-- qualquer um com a URL do projeto e a chave pública.
--
-- Como já cumpriram a função, saem em vez de ganharem policy. Conferido antes
-- de apagar: 0 duplicatas na base, 0 vendas órfãs, e nenhuma pessoa do backup
-- ausente hoje. A única divergência aparente era alguém que corrigiu o próprio
-- e-mail no Mailchimp — mesma linha, mesmo id, nenhum dado perdido.
--
-- Guardar 46 mil contatos parados é risco sem contrapartida.

drop table if exists public.leads_backup_20260813;
drop table if exists public.sales_lead_backup_20260813;

-- 2) TRÊS VIEWS SECURITY DEFINER
--
-- Views com SECURITY DEFINER rodam com a permissão de quem criou, ignorando o
-- RLS das tabelas de baixo — uma porta lateral por desenho, não por descuido.
--
-- Nenhuma das três é consultada pelo painel: são views de diagnóstico, usadas
-- na mão pelo SQL editor, que roda como service role e ignora RLS de qualquer
-- forma. Inverter para invoker não muda nada em uso e fecha a porta para
-- anon/authenticated.

alter view public.asaas_sem_vendedor set (security_invoker = true);
alter view public.hd_previa_distribuicao set (security_invoker = true);
alter view public.support_resolucoes_stats set (security_invoker = true);
