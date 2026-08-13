-- Links & QR: deletar passa a ser reversível.
--
-- A lixeira da tela some com o link da lista, mas o registro fica: um QR já
-- impresso num vídeo continua existindo no mundo, e apagar a linha faria o
-- scan cair num 404 sem deixar rastro de que o link existiu. Com deleted_at o
-- redirect pode continuar respondendo e a tela de Deletados permite voltar
-- atrás.
--
-- Não há delete definitivo em lugar nenhum da interface, de propósito.

alter table tracked_links add column if not exists deleted_at timestamptz;

create index if not exists tracked_links_deleted_at_idx
  on tracked_links (deleted_at)
  where deleted_at is not null;
