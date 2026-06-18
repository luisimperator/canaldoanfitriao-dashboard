# E-mails de autenticação — Canal do Anfitrião

Templates de e-mail (PT-BR) para o **Supabase Auth**, com identidade visual consistente:
cabeçalho grafite (`#0F172A`) + botão/destaque âmbar (`#E0A75E`).

> ⚠️ Os templates só podem ser editados no Supabase com **SMTP customizado ativado**
> (Authentication → Emails → SMTP Settings). Sem isso, o Supabase usa os templates padrão em inglês.

## Como aplicar

Em **Supabase → Authentication → Emails → Templates**, abra cada template e cole o **Subject** e o **HTML** correspondente.

### E-mails de autenticação

| Arquivo | Template no Supabase | Subject sugerido | Variáveis usadas |
|---|---|---|---|
| `confirmacao-cadastro.html` | Confirm sign up | `Confirme seu cadastro · Canal do Anfitrião` | `{{ .ConfirmationURL }}` |
| `convite.html` | Invite user | `Você foi convidado para o Canal do Anfitrião` | `{{ .ConfirmationURL }}` |
| `magic-link.html` | Magic Link or OTP | `Seu link de acesso · Canal do Anfitrião` | `{{ .ConfirmationURL }}`, `{{ .Token }}` |
| `alteracao-email.html` | Change email address | `Confirme a alteração do seu e-mail · Canal do Anfitrião` | `{{ .ConfirmationURL }}`, `{{ .Email }}`, `{{ .NewEmail }}` |
| `reautenticacao.html` | Reauthentication | `Seu código de verificação · Canal do Anfitrião` | `{{ .Token }}` |
| `redefinicao-senha.html` | Reset password | `Redefinição de senha · Canal do Anfitrião` | `{{ .ConfirmationURL }}` |

### E-mails de notificação de segurança

São avisos informativos (sem botão/link). Mantenha-os **ativados** em Authentication → Emails → Templates → Security.

| Arquivo | Notificação no Supabase | Subject sugerido | Variáveis usadas |
|---|---|---|---|
| `seguranca-senha-alterada.html` | Password changed | `Sua senha foi alterada · Canal do Anfitrião` | — |
| `seguranca-email-alterado.html` | Email address changed | `Seu e-mail de acesso foi atualizado · Canal do Anfitrião` | `{{ .OldEmail }}`, `{{ .Email }}` |
| `seguranca-telefone-alterado.html` | Phone number changed | `Seu telefone foi atualizado · Canal do Anfitrião` | `{{ .OldPhone }}`, `{{ .Phone }}` |
| `seguranca-login-vinculado.html` | Sign-in method linked | `Novo método de login na sua conta · Canal do Anfitrião` | `{{ .Provider }}`, `{{ .Email }}` |
| `seguranca-login-removido.html` | Sign-in method removed | `Um método de login foi removido · Canal do Anfitrião` | `{{ .Provider }}`, `{{ .Email }}` |
| `seguranca-verificacao-adicionada.html` | MFA method added | `Verificação em duas etapas adicionada · Canal do Anfitrião` | `{{ .FactorType }}` |
| `seguranca-verificacao-removida.html` | MFA method removed | `Um método de verificação foi removido · Canal do Anfitrião` | `{{ .FactorType }}` |

## Personalização

- **Logo:** os templates de autenticação têm um comentário no cabeçalho mostrando onde trocar o texto por uma `<img>`.
- **Cor de destaque:** o âmbar `#E0A75E` sobre grafite `#0F172A`. Troque o hex se a marca tiver outra cor.

> Não altere o conteúdo entre `{{ }}` — o Supabase substitui essas variáveis pelos valores reais
> (link de ação, código de verificação, e-mails, provedor, etc.). Sem elas, os e-mails não funcionam.
