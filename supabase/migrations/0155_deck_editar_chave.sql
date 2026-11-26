-- Chave da rota /api/decks/editar (edição dos decks públicos no Storage,
-- chamada pelo banco). O segredo nasce aleatório no Vault, na hora da
-- migração, e nunca aparece no código.

select vault.create_secret(encode(extensions.gen_random_bytes(24), 'hex'), 'deck_editar_chave',
                           'Chave da rota /api/decks/editar (decks públicos)')
where not exists (select 1 from vault.secrets where name = 'deck_editar_chave');

create or replace function public.deck_editar_chave()
returns text
language sql
stable
security definer
set search_path to ''
as $$
  select decrypted_secret from vault.decrypted_secrets where name = 'deck_editar_chave';
$$;

revoke all on function public.deck_editar_chave() from public, anon, authenticated;
