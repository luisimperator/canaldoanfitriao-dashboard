# E-mails de autenticação — Canal do Anfitrião

Templates de e-mail (PT-BR) para o **Supabase Auth**, com identidade visual consistente:
cabeçalho grafite (`#0F172A`) + botão âmbar (`#E0A75E`).

> ⚠️ Os templates só podem ser editados no Supabase com **SMTP customizado ativado**
> (Authentication → Emails → SMTP Settings). Sem isso, o Supabase usa os templates padrão em inglês.

## Como aplicar

Em **Supabase → Authentication → Emails → Templates**, abra cada template e cole o **Subject** e o **HTML** correspondente:

| Arquivo | Template no Supabase | Subject sugerido | Variáveis usadas |
|---|---|---|---|
| `confirmacao-cadastro.html` | Confirm sign up | `Confirme seu cadastro · Canal do Anfitrião` | `{{ .ConfirmationURL }}` |
| `convite.html` | Invite user | `Você foi convidado para o Canal do Anfitrião` | `{{ .ConfirmationURL }}` |
| `magic-link.html` | Magic Link or OTP | `Seu link de acesso · Canal do Anfitrião` | `{{ .ConfirmationURL }}`, `{{ .Token }}` |
| `alteracao-email.html` | Change email address | `Confirme a alteração do seu e-mail · Canal do Anfitrião` | `{{ .ConfirmationURL }}`, `{{ .Email }}`, `{{ .NewEmail }}` |
| `reautenticacao.html` | Reauthentication | `Seu código de verificação · Canal do Anfitrião` | `{{ .Token }}` |
| `redefinicao-senha.html` | Reset password | `Redefinição de senha · Canal do Anfitrião` | `{{ .ConfirmationURL }}` |

## Personalização

- **Logo:** cada arquivo tem um comentário no cabeçalho mostrando onde trocar o texto por uma `<img>`.
- **Cor de destaque:** o botão usa âmbar `#E0A75E` sobre grafite `#0F172A`. Troque o hex se a marca tiver outra cor.

> Não altere o conteúdo entre `{{ }}` — o Supabase substitui essas variáveis pelos valores reais
> (link de ação, código de verificação, e-mails). Sem elas, os e-mails não funcionam.
