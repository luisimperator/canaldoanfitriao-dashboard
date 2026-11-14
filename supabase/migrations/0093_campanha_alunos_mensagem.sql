-- Disparo pra alunos: o texto que cada um recebeu (o corpo do template, com o
-- nome), pra o Téo saber a que mensagem o aluno está respondendo e pra medir
-- resposta por variante (onda 1: D e E, 50 de cada, sorteados).
alter table public.campanha_alunos add column if not exists mensagem text;
comment on column public.campanha_alunos.template is 'Variante sorteada (ex.: D, E) ou nome do template enviado.';
comment on column public.campanha_alunos.mensagem is 'Texto que o aluno recebeu (corpo do template).';
