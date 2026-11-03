# Lista de Espera 2.0: condições da tag "teo" (02/11/2026)

Automação do Unnichat `z8SQBcZZnGP8WcDgsVOj` ("Lista de Espera 2.0", conexão
WhatsApp `Jok7CAImBvRbEXUMY2Ji`). Ela dá boas-vindas, aplica a pesquisa de 4
perguntas e distribui os leads pros vendedores. Em 02/11/2026 entraram 11
condições "O contato possui alguma das tags **teo**" (a tag que o Téo põe em
todo lead que assume, PR #204). Feito à mão no editor do Unnichat pelo Claude
do Chrome; os prints estão nesta pasta. Fluxo: 60 → 71 passos.

## Antes dos passos de atendente e do sorteio (quem tem "teo" pula o passo)

| # | Print | Onde | Com "teo" vai para |
|---|---|---|---|
| 1 | `01_…apos-Continuar` | botão "Continuar" do flow da pesquisa → Remover atendente | tag #respondeu-pesquisa |
| 2 | `02_…apos-Confirmar` | botão "Confirmar" das boas-vindas → Remover atendente | mensagem das 4 perguntas |
| 3 | `03_…apos-Bora` | botão "Bora?" da tentativa 3 → Remover atendente | mensagem das 4 perguntas |
| 4 | `04_…Leads-Muito-Frios` | pipeline Leads Muito Frios → Remover atendente | fim |
| 5 | `05_…Gigantes` | pipeline Gigantes → Atribuir grupo Comercial | fim |
| 6 | `06_…A5E` | pipeline A5E → Atribuir grupo Comercial | fim |
| 7 | `07_…Frios` | pipeline Frios → Atribuir grupo Comercial | fim |
| 8 | `08_…sorteio-50-50` | antes do sorteio 50%/50% | fim |

## Antes das tentativas de contato (quem tem "teo" para, sem receber nada)

| # | Print | Template |
|---|---|---|
| 9 | `09_antes-da-tentativa-2` | tentativa_de_contato_2_copy (duas entradas, as duas passam pela condição) |
| 10 | `10_antes-da-tentativa-3` | tentativa_de_contato_3_copy (duas entradas) |
| 11 | `11_antes-da-tentativa-4` | tentativa_de_contato_4_copy |

## Observações

- Três passos "Remover atendente" e o trecho que vai da tag #Respondeu primeiro
  contato ao sorteio não têm nenhuma seta de entrada: ninguém chega neles.
- A cópia desativada "Lista de Espera 2.0 (copy)" ficou como estava.
- Reserva no código (PR #205): se mesmo assim a conversa cair com um vendedor que
  não falou com o lead, o Téo puxa de volta antes de responder ("reatribuído ao
  Téo" no webhook_log).
