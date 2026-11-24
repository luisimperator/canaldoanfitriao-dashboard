-- Téo: o texto de cada modelo de acompanhamento, pra revisão ler antes de mandar.
--
-- Com a janela de 24h fechada, o acompanhamento é um modelo aprovado, e ele
-- saía sem ninguém ler a conversa: a Thalita (convidada do Rômulo Visita)
-- ouviu do Téo "não vou mais te incomodar com oferta", a ficha dizia "não
-- mandar mais nada comercial" e ela recebeu três modelos (18, 20 e 24/11;
-- Fernando, 24/11: "achei essa abordagem escrota"). Agora, antes de cada
-- modelo, revisarAcompanhamento (src/lib/teo.ts) lê a ficha e o fim da
-- conversa e decide: enviar, pular esta etapa ou encerrar.
--
-- teo_config.followup_textos: corpo de cada modelo, na mesma ordem de
--   followup_templates ({{1}} = primeiro nome). Quem trocar um modelo troca o
--   texto aqui também; sem o texto, a revisão decide só pela ficha e pela conversa.

alter table public.teo_config add column if not exists followup_textos jsonb;

update public.teo_config
set followup_textos = jsonb_build_array(
  'Olá {{1}}, tá por aí? 😬',
  'Oi, {{1}}! Passando só para saber se conseguiu ver minha mensagem. Ainda faz sentido conversarmos sobre isso?',
  'Oi {{1}}, imagino que tá corrido por ai né? Tem algum horário melhor pra falarmos ?',
  'Ei {{1}}, desistiu do projeto de gestão por temporada?',
  E'Olá {{1}}, vim me despedir de você.\n\nNos últimos dias tentei contato pra falarmos sobre seu acesso ao curso do canal do anfitrião, porém sem sucesso. Posso entender que esse tema não é mais uma prioridade pra você?'
)
where id = 1
  and followup_templates = '["1308926341125998","1075649208754464","1677952009943628","2378688632938377","4329122963971853"]'::jsonb;
