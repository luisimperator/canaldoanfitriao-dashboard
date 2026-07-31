-- Credenciais do WhatsApp no Vault, não em variável de ambiente.
--
-- Motivo prático: dá pra ligar (e trocar) o número sem abrir a Vercel e sem
-- deploy. O app lê por esta função, que só a service role pode executar.
--
-- Nomes usados no vault:
--   whatsapp_token           token permanente (System User)
--   whatsapp_phone_number_id id do número (não é o WABA id)
--   whatsapp_app_secret      app secret (verifica assinatura do webhook)
--   whatsapp_verify_token    string do handshake do webhook
--   whatsapp_waba_id         id da conta WhatsApp Business (opcional)

create table if not exists public.whatsapp_flags (
  chave text primary key,
  valor text not null,
  updated_at timestamptz not null default now()
);
alter table public.whatsapp_flags enable row level security;

insert into public.whatsapp_flags (chave, valor)
values ('auto_reply', 'false')          -- IA calada até você ligar
on conflict (chave) do nothing;

create or replace function public.whatsapp_config()
returns jsonb
language sql
stable
security definer
set search_path to 'public', 'vault'
as $$
  select jsonb_build_object(
    'token',          (select decrypted_secret from vault.decrypted_secrets where name = 'whatsapp_token'),
    'phone_number_id',(select decrypted_secret from vault.decrypted_secrets where name = 'whatsapp_phone_number_id'),
    'app_secret',     (select decrypted_secret from vault.decrypted_secrets where name = 'whatsapp_app_secret'),
    'verify_token',   (select decrypted_secret from vault.decrypted_secrets where name = 'whatsapp_verify_token'),
    'waba_id',        (select decrypted_secret from vault.decrypted_secrets where name = 'whatsapp_waba_id'),
    'auto_reply',     (select valor from whatsapp_flags where chave = 'auto_reply')
  );
$$;

-- Só a service role (servidor) lê isso. Ninguém logado no painel consegue.
revoke all on function public.whatsapp_config() from public, anon, authenticated;
grant execute on function public.whatsapp_config() to service_role;
