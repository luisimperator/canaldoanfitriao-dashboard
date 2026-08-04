-- Documentos de referência do suporte, lidos pela IA sob demanda (ferramenta),
-- NÃO injetados no prompt — os mapas têm centenas de linhas e entrariam em
-- toda mensagem. A Lia consulta com consultar_mapa_cursos, que busca trechos.
-- Um doc por curso: quando o lookup diz qual curso o aluno tem, a busca vai
-- só nele e não mistura caminho de A5E com Gigantes.
-- Atualizar um mapa = rodar de novo o INSERT dele (on conflict atualiza).

create table if not exists public.support_docs (
  slug text primary key,
  titulo text not null,
  conteudo text not null,
  updated_at timestamptz not null default now()
);
-- RLS sem policy: só a service role (que bypassa RLS) lê/escreve.
alter table public.support_docs enable row level security;

-- ============================== A5E ==============================

insert into public.support_docs (slug, titulo, conteudo) values (
  'mapa-a5e',
  'Mapa do curso Anfitrião 5 Estrelas (A5E)',
  $a5e$
# Anfitrião 5 Estrelas (A5E) — Mapa de Aulas e Anexos

Rômulo Villela · app.nutror.com · 29 módulos · 222 aulas · 12 aulas com anexo. Atualizado em junho/2026.

## Como funciona o acesso
- O curso fica em app.nutror.com; as aulas são organizadas em módulos.
- Os anexos/materiais ficam DENTRO da própria aula (contratos, planilhas, cartilhas, checklists). NÃO existe aba separada de "downloads": para baixar, o aluno abre a aula indicada e procura o anexo ali.
- Lives gravadas aparecem como módulos próprios (ex.: "Encontros mensais").

## Anexos — onde baixar cada material (A5E)

| Módulo | Aula | Anexo(s) |
|---|---|---|
| 2ª Chave do Imóvel de Sucesso: Precificação do imóvel | Como fazer promoções dentro do Airbnb | `PT How Discounts and Promotions Work on Airbnb.pdf`, `PT. Airbnb Promotional Getaway Campaign Explained.pdf` |
| Imposto de Renda | Introdução ao Imposto de Renda | `Cartilha - Impostos aos Proprietários no Aluguel por Temporada.pdf` |
| Imposto de Renda | Como declarar imposto de renda | `Cartilha - Impostos aos Proprietários no Aluguel por Temporada.pdf`, `Guia-Tributário-para-Anfitriões-do-Airbnb.pdf` |
| Imposto de Renda | Imposto de Renda e Airbnb (Novidades 2025) | `Aluguel por Temporada - Resumo dos Impostos e CNAEs.pdf` |
| Imposto de Renda | Como a reforma tributária afeta gestores e anfitriões | `RESUMO DA AULA.pdf` |
| Legislação: O que a lei diz sobre Airbnb | Garantia de Locação | `CONTRATO - TEMPORADA (CANAL DO ANFITRIAO)`, `CONTRATO DE LOCAÇÃO RESIDENCIAL PADRAO.docx` |
| Gestão de imóveis para terceiros | Repasse de proprietários | `controle-repasse.xlsx` |
| Série especial: Da planta ao Airbnb: Studio de 19 m² | Meu investimento: imóvel na planta | `Checklist - Itens essenciais.docx` |
| Série especial: Da planta ao Airbnb: Studio de 19 m² | Tour pelo Studio de 19 m² | `regras-da-casa-canal-do-anfitriao (1).docx` |
| Mensagens automáticas: Script Seu imóvel no piloto automático | Passo a passo com tutorial + PDF + Cards | `card-boas-vindas.docx`, `regras-da-casa-canal-do-anfitriao (1).docx`, `ROTEIRO DE SUCESSO 2023 - CANAL DO ANFITRIÃO.pdf` |
| Encontros mensais | Como a reforma tributária afeta gestores e anfitriões (Janeiro 2026) | `RESUMO DA AULA.pdf`, `Guia_Tributario_Airbnb.pdf` |
| Análise de Anúncios | Como configurar pacotes de viagens dentro do Pricelabs + comparador de preços (Setembro 2024) | `QUARTA ANÁLISE DE ANÚNCIOS - PACOTE DE REVEILLON.docx` |

## Estrutura completa (módulos e aulas) — A5E

### 1. Comece por aqui — 4 aulas
- Seja bem-vindo ao curso
- Como tirar o máximo do grupo exclusivo
- Tour pela plataforma do curso
- O que você vai aprender

### 2. IAs para anfitriões — 3 aulas
- IA para Remoção de comentários no Airbnb
- IA Farol da Qualidade
- IA Consultor de pacotes dia ouro

### 3. Mão na Massa: Mexendo no Airbnb Passo-a-Passo — 16 aulas
- Tour pela plataforma do Airbnb
- Anúncio Express Airbnb
- Como alterar uma data de reserva
- Como estabelecer estadias mínimas no Airbnb
- Políticas de cancelamento e cuidados
- Taxa de 15% ou 3%
- Como vincular calendários no Airbnb
- Como duplicar ou deletar um anúncio
- Como configurar a sua conta bancária
- Como o hóspede paga pelas reservas no Airbnb?
- Cuidado com reservas acima de 28 noites
- Status do painel de mensagens
- Pra que serve a pré-aprovação no Airbnb
- Como dominar o algoritmo do Airbnb
- O que derruba a sua posição no ranking
- Como monitorar as visualizações

### 4. 1ª Chave do Imóvel de Sucesso: Hospitalidade e Encantamento — 6 aulas
- A importância de uma boa foto
- Responda as mensagens com velocidade
- Como funciona o Superhost
- Insights de anúncios incríveis e bem avaliados do Airbnb
- Como perceber problemas com hospitalidade que afetam a nota
- Preferido dos hóspedes

### 5. 2ª Chave do Imóvel de Sucesso: Precificação do imóvel — 19 aulas
- Como definir a diária do seu imóvel
- Estratégias de precificação
- Como fazer promoções dentro do Airbnb — Anexo: `PT How Discounts and Promotions Work on Airbnb.pdf`, `PT. Airbnb Promotional Getaway Campaign Explained.pdf`
- Estratégias de calendário
- Usando a Oferta especial
- Taxa de conversão no Airbnb
- Pricelabs e o mercado brasileiro
- Precificação dinâmica: Pricelabs
- Novo algoritmo de precificação do Pricelabs
- Os melhores lugares para Airbnb
- Ferramentas para análisar o potencial do imóvel
- Aluguel tradicional x temporada
- Conjunto de regras
- Como fazer pacotes no Airbnb
- Estratégia do DIA OURO - Como montar pacotes de feriados
- Cuidado com taxa de ocupação alta
- Nenhum calendário é igual ao outro
- Taxa de limpeza
- Como cobrar por hóspedes extras

### 6. 3ª Chave do Imóvel de Sucesso: Gestão Financeira e Operacional — 8 aulas
- Gestão Financeira
- Lavanderia
- Taxa de Limpeza
- Gestão de custos adicionais
- Intervalo entre check-in e check-out
- Devo flexibilizar checkin ou checkout?
- Posso pedir o documento do hóspede?
- Checkin e Checkout

### 7. 4ª Chave do Imóvel de Sucesso: Otimização — 1 aula
- A Chave da Otimização

### 8. 5ª Chave do Imóvel de Sucesso: Mentalidade — 1 aula
- Mentalidade

### 9. Imposto de Renda — 4 aulas
- Introdução ao Imposto de Renda — Anexo: `Cartilha - Impostos aos Proprietários no Aluguel por Temporada.pdf`
- Como declarar imposto de renda — Anexo: `Cartilha - Impostos aos Proprietários no Aluguel por Temporada.pdf`, `Guia-Tributário-para-Anfitriões-do-Airbnb.pdf`
- Imposto de Renda e Airbnb (Novidades 2025) — Anexo: `Aluguel por Temporada - Resumo dos Impostos e CNAEs.pdf`
- Como a reforma tributária afeta gestores e anfitriões — Anexo: `RESUMO DA AULA.pdf`

### 10. Legislação: O que a lei diz sobre Airbnb — 5 aulas
- Introdução à legislação imobiliária
- O que diz a Constituição Federal? E o Código Civil?
- Garantia de Locação — Anexo: `CONTRATO - TEMPORADA (CANAL DO ANFITRIAO)`, `CONTRATO DE LOCAÇÃO RESIDENCIAL PADRAO.docx`
- Cobrança de Aluguel
- O síndico pode me proibir de alugar por diária?

### 11. Gestão de imóveis para terceiros — 5 aulas
- Gestão do Airbnb para Terceiros
- Como funciona o co-host?
- Quanto cobrar de comissão como co-host?
- Como fazer a divisão dos pagamentos como co-host?
- Repasse de proprietários — Anexo: `controle-repasse.xlsx`

### 12. Dúvidas do dia a dia — 21 aulas
- Dúvidas Frequentes
- Como fazer reservas diretas?
- Construir para alugar por diária é uma boa ideia?
- Querem alugar meu imóvel para prostituição
- Como controlar as visitas do hóspede?
- Devo pedir documento do hóspede?
- Devo pedir para o hóspede me avaliar?
- Devo permitir check-ins ou check-outs em horários diferentes?
- E se o hóspede for barrado na portaria?
- E se o hóspede não sair no checkout?
- Devo fazer check-out pessoalmente?
- Posso anunciar um imóvel que não está no meu nome?
- Por que meu anúncio não aparece na busca?
- Querem alugar meu imóvel para ensaio fotográfico
- Tenho que ter exclusividade no Airbnb?
- Como consultar o CPF de um hóspede
- Como o hóspede te avalia no Airbnb?
- Como remover comentários
- Como acionar AirCover
- Soluções para Self Check In
- Como funciona a avaliação do hóspede para o Anfitrião no Airbnb

### 13. Série especial: Da planta ao Airbnb: Studio de 19 m² — 5 aulas
- Meu investimento: imóvel na planta — Anexo: `Checklist - Itens essenciais.docx`
- Tour pelo Studio de 19 m² — Anexo: `regras-da-casa-canal-do-anfitriao (1).docx`
- Estudo de mercado e rentabilidade
- Investimento e reforma
- Studio 19m² - Atualização Abril/2023

### 14. Série especial: Como gerir um imóvel no litoral a distância — 6 aulas
- 01 - Preparando o imóvel para locação
- 02 - Pesquisa: descobrindo o potencial do imóvel
- 03 - Como fazer a operação do dia a dia
- 04 - Atualização: 1 mês depois
- 05 - atualização: 6 meses depois
- Atualização Final - Balneário Camboriú

### 15. Masterclasses especiais — 7 aulas
- Masterclass com Fellycia Leardine
- Masterclass Hobbit House
- Masterclass: Pricelabs, com Joana Pires Coelho
- Masterclass: Como fazer um estudo inteligente de rentabilidade
- Masterclass: Casa Vista, uma casa container, com Gui Torniero
- Masterclass: Limpeza profissional para Airbnb, com Sylvana Farhat
- Masterclass: Dominando o algoritimo do Airbnb, com Roberto Patrón, Head de vendas do Airbnb

### 16. Mensagens automáticas: Script Seu imóvel no piloto automático — 1 aula
- Passo a passo com tutorial + PDF + Cards — Anexo: `card-boas-vindas.docx`, `regras-da-casa-canal-do-anfitriao (1).docx`, `ROTEIRO DE SUCESSO 2023 - CANAL DO ANFITRIÃO.pdf`

### 17. Panorama geral das plataformas de locação — 8 aulas
- Panorama das Plataformas
- Airbnb
- Booking.com
- Booking.com - Como criar um anúncio
- Expedia
- Vrbo
- Outras plataformas
- Qual plataforma escolher?

### 18. Como fazer reservas diretas sem o Airbnb — 1 aula
- Operações financeiras

### 19. Crises e como enfrentá-las — 2 aulas
- Como se preparar para as crises
- O que fazer com meu imóvel na crise?

### 20. Teoria complementar: O mercado imobiliário e a economia — 4 aulas
- Introdução do Módulo: Economia
- O mínimo que você precisa saber sobre economia para cuidar bem do seu imóvel
- Investindo em imóveis
- Fundos imobiliários

### 21. Teoria complementar: Investimentos em Imóveis — 6 aulas
- Meu investimento: imóvel na planta
- Vale a pena financiar?
- Imóveis Turísticos
- Como eu comecei: o imóvel da minha família (com números!)
- Tradicional vs Aluguel
- Imóveis em Leilão

### 22. Teoria complementar: A Revolução do Aluguel por Diária — 5 aulas
- A Revolução do Aluguel por Diária
- O Modelo Airbnb
- Tenho que ser dono de um imóvel para alugar por diária?
- Tecnologia e os Imóveis
- Qualquer imóvel funciona no Airbnb?

### 23. Encontros mensais — 25 aulas
- Como remover comentários no Airbnb
- Como acionar o seguro do Airbnb, Aircover
- Como organizar as operações do seu Airbnb
- Live Studio, flat, loft, apartamento, NR, qual é melhor?
- Soluções para Self Check In
- Atendimento aos hóspedes: Ferramentas e soluções
- Limpeza / Enxoval / Diaristas / Empresas terceirizadas
- Entendendo as métricas de conversão do seu anúncio no Airbnb
- Dicas para anunciar na Booking.com
- Administração para Terceiros (Janeiro 2025)
- Marketing Digital para o Airbnb - Tráfego Pago, Instagram, criação de conteúdo etc (Fevereiro 2025)
- Imposto de Renda e Airbnb (Março 2025)
- Introdução ao Channel Manager (abril 2025)
- Dominando o algoritmo do Airbnb (Maio 2025)
- Tipos de hóspedes e como lidar com cada um (Junho 2025)
- Performance do Anúncio: Como analisar métricas (Julho 2025)
- Como saber se o imóvel está rentável ou não? (Agosto 2025)
- AI exclusiva para remoção de comentários (Setembro 2025)
- Como a IA pode te ajudar a resolver problemas de experiência do seu Airbnb (Outubro 2025)
- O que não fazer ao mobiliar imóvel para a temporada (Novembro 2025)
- Como a reforma tributária afeta gestores e anfitriões (Janeiro 2026) — Anexo: `RESUMO DA AULA.pdf`, `Guia_Tributario_Airbnb.pdf`
- Como a IA está reinventando o atendimento aos hóspedes (Fevereiro 2026)
- Como levantar dados e desempenho de uma cidade para Airbnb (Março 2026)
- Erros invisíveis que fazem o anfitrião/gestor demorar a crescer (Abril 2026)
- Tudo sobre a decisão do STJ e a polêmica do HIS e HMP (Maio 2026)

### 24. Gravação das Mentorias — 7 aulas
- Mentoria em grupo da Turma 13 - Primeiro Grupo
- Mentoria em grupo da Turma 13 - Segundo Grupo
- Mentoria em grupo da Turma 16 - Primeiro Grupo
- Mentoria em grupo da Turma 16 - Segundo Grupo
- Mentoria em grupo da Turma 17 - Primeiro Grupo
- Mentoria em grupo da Turma 17 - Segundo Grupo
- Mentoria em grupo da Turma 17 - Terceiro Grupo

### 25. Palestras do Rômulo — 2 aulas
- Palestra: Aluguel de imóveis por diária
- Como fazer reels da sua acomodação no Instagram

### 26. 1º Encontro Anfitrião 5 Estrelas — 2 aulas
- Palestra Rômulo - Encontro dos Anfitriões
- Palestra Felipe Banlaky - Encontro dos Anfitriões

### 27. Análise de Anúncios — 23 aulas
- 1ª Análise de Anúncios, com Moisés Cassiano
- Passo a passo de como implementar o Pricelabs (Agosto/2024)
- 2ª Análise de Anúncios com Moisés Cassiano
- Como configurar pacotes de viagens dentro do Pricelabs + comparador de preços (Setembro 2024) — Anexo: `QUARTA ANÁLISE DE ANÚNCIOS - PACOTE DE REVEILLON.docx`
- Análise de Anúncios (Outubro 2024)
- Análise de Anúncios (Novembro 2024)
- Análise de anúncios (Dezembro 2024)
- Análise de Anúncios (Janeiro 2025)
- Análise de anúncios (Fevereiro 2025)
- Análise de anúncios (Março 2025)
- Análise de anúncios (Abril 2025)
- Análise de anúncios (Maio 2025)
- Análise de anúncios (Junho 2025)
- Análise de Anúncios (Julho 2025)
- Análise de Anúncios (Setembro 2025)
- Análise de Anúncios (Outubro 2025)
- Análise de Anúncios (Novembro 2025)
- Análise de Anúncios (Dezembro 2025)
- Análise de Anúncios (Janeiro 2026)
- Análise de Anúncios (Fevereiro 2026)
- Análise de Anúncios (Abril 2026)
- Análise de Anúncios (Maio 2026)
- Análise de Anúncios (Junho 2026)

### 28. Imersão: Do Zero ao seu Melhor Anúncio — 22 aulas
- 01 - Introdução
- 02 - Oportunidades ao aprender Airbnb
- 03 - Os 3 Pilares
- 04 - Onde e como atuar
- 05 - Como extrair o máximo da plataforma do Airbnb
- 06 - Comunidade A5E
- 07 - Como montar um Anúncio preferido - Foto de Capa
- 08 - Como montar um Anúncio preferido - Mosaico
- 09 - Como montar um Anúncio preferido - Título
- 10 - Como montar um Anúncio preferido - Descrição
- 11 - Como montar um Anúncio preferido - Preço
- 12 - Como montar um Anúncio preferido - Avaliações
- 13 - Fim do bloco da manhã
- 14 - Ferramentas profissionais
- 15 - Como funciona o algoritmo do Airbnb
- 16 - Preferido dos hóspedes
- 17 - Aprendizados gerais
- 18 - Resultados do meu estudio de 19m²
- 19 - Meu faturamento no Airbnb
- 20 - Perguntas e respostas
- 21 - Análise de anuncios
- Show do Intervalo

### 29. Lives com arquiteta Thais Lima — 3 aulas
- COMO DEIXAR SEU IMÓVEL MAIS ATRAENTE GASTANDO POUCO (Setembro 2025)
- Detalhes que fazem o hóspede ignorar o seu anúncio (Outubro 2025)
- Arquitetura inteligente: O que evitar no seu imóvel para temporada (Março 2026)

Fonte: "Mapa de Aulas e Anexos" (Nutror), atualizado em junho/2026.
$a5e$
) on conflict (slug) do update
  set titulo = excluded.titulo, conteudo = excluded.conteudo, updated_at = now();

-- ============================== GIGANTES ==============================

insert into public.support_docs (slug, titulo, conteudo) values (
  'mapa-gigantes',
  'Mapa do curso Gigantes da Temporada',
  $gig$
# Gigantes da Temporada — Mapa de Aulas e Anexos

Rômulo Villela · app.nutror.com · 20 módulos · 167 aulas · 17 aulas com anexo. Atualizado em junho/2026.

## Como funciona o acesso
- O curso fica em app.nutror.com; as aulas são organizadas em módulos.
- Os anexos/materiais ficam DENTRO da própria aula (contratos, planilhas, cartilhas, laudos). NÃO existe aba separada de "downloads": para baixar, o aluno abre a aula indicada e procura o anexo ali.
- Lives gravadas aparecem como módulos próprios ou marcadas com "(Live)".

## Anexos — onde baixar cada material (Gigantes)

| Módulo | Aula | Anexo(s) |
|---|---|---|
| Módulo 1 - O Modelo do Negócio | Aula 9 - Como funciona o comissionamento? | `controle-repasse.xlsx` |
| Módulo 1 - O Modelo do Negócio | Aula 10 - Taxa de implantação | `EXEMPLO DE LAUDO DE VISTORIA.docx` |
| Módulo 2 – Contabilidade, tributação e burocracias | Aula 5: Contabilidade com Renato Correia | `Cartilha - Impostos aos Proprietários no Aluguel por Temporada.pdf` |
| Módulo 2 – Contabilidade, tributação e burocracias | Atualizações: Reforma tributária (2026) | `RESUMO DA AULA.pdf` |
| Módulo 3 - Estruturando o seu financeiro | Aula 1: Como funciona a lógica financeira | `mapa-mental-fluxo-caixa.jpg` |
| Módulo 3 - Estruturando o seu financeiro | Aula 2: Fazendo o controle financeiro da empresa | `PLANILHA CONTROLE FINANCEIRO EMPRESA.xlsx`, `CONTROLE REPASSE PROPRIETÁRIOS.xlsx` |
| Módulo 3 - Estruturando o seu financeiro | Aula 3: A lógica do repasse ao proprietário | `CONTROLE REPASSE PROPRIETÁRIOS.xlsx` |
| Módulo 5 - Gestão empresarial | Aula 3: Viabilidade financeira do negócio | `PLANILHA CONTROLE FINANCEIRO EMPRESA.xlsx` |
| Módulo 6 - Organizando as operações | Aula 0: Colocando ordem no caos | `CONTROLE ADMINISTRATIVO DE APTOS GIGANTES.xlsx` |
| Módulo 6 - Organizando as operações | Aula 2: Processo de vistoria entre reservas | `VISTORIA PREVENTIVA.pdf` |
| Módulo 8 - Jurídico e administrativo | Aula 2: Contrato de administração Parte 1 | `MODELO CONTRATO ADMINISTRACAO.docx`, `MODELO DISTRATO PROPRIETÁRIO CURSO.docx`, `MODELO CONTRATO 2026.docx` |
| Módulo 8 - Jurídico e administrativo | Aula 3: Contrato de administração Parte 2 | `MODELO DISTRATO PROPRIETÁRIO CURSO.docx` |
| Módulo 8 - Jurídico e administrativo | Aula 5: Contrato com hóspedes/inquilinos | `CONTRATO SIMPLES DE TEMPORADA.pdf`, `CONTRATO DE LOCAÇÃO RESIDENCIAL.docx` |
| Módulo 9 - Comercial e Marketing | Aula 4: Como fazer uma apresentação irresistível para o proprietário | `Rômulo Apresentação 2026.pdf` |
| Módulo 10 - Implantação dos imóveis | Aula 1: Projeto e arquitetura | `Checklist - Itens essenciais.docx` |
| Módulo 10 - Implantação dos imóveis | Aula 2: Implantação do imóvel | `LAUDO DE VISTORIA.docx` |
| Módulo 12 - Gestão de pessoas | Como treinar equipe para o atendimento (Live) | `controle-administrativo-de-aptos-gigantes.xlsx` (mesmo arquivo do Módulo 6, com grafia diferente) |

## Estrutura completa (módulos e aulas) — Gigantes

### Módulo 1 - O Modelo do Negócio — 14 aulas
- Aula 1 - Boas-vindas
- Aula 2 - Como funciona o modelo de negócio de temporada
- Aula 3 - Zonas de atuação do seu negócio
- Aula 4 - Quais serviços você pode prestar
- Aula 5 - O tripé da gestão profissional de temporada
- Aula 6 - Tecnologias e soluções para tocar o seu negócio
- Aula 7 - Plataformas de aluguel
- Aula 8 - Construindo a sua marca
- Aula 9 - Como funciona o comissionamento? — Anexo: `controle-repasse.xlsx`
- Aula 10 - Taxa de implantação — Anexo: `EXEMPLO DE LAUDO DE VISTORIA.docx`
- Aula 11 - Relação com o proprietário
- Aula 12 - Fundo de reposição
- Produtos e serviços para o gestor ganhar além da gestão dos imóveis (live)
- Gestão de Expectativa dos Proprietários (Live)

### Módulo 2 – Contabilidade, tributação e burocracias — 7 aulas
- Aula 1: Abrindo um CNPJ
- Aula 2: CRECI
- Aula 3: Regime tributário
- Aula 4: Impostos e declaração
- Aula 5: Contabilidade com Renato Correia — Anexo: `Cartilha - Impostos aos Proprietários no Aluguel por Temporada.pdf`
- Atualizações IR: Como ficam os gestores (Março 2025)
- Atualizações: Reforma tributária (2026) — Anexo: `RESUMO DA AULA.pdf`

### Módulo 3 - Estruturando o seu financeiro — 10 aulas
- Aula 1: Como funciona a lógica financeira — Anexo: `mapa-mental-fluxo-caixa.jpg`
- Aula 2: Fazendo o controle financeiro da empresa — Anexo: `PLANILHA CONTROLE FINANCEIRO EMPRESA.xlsx`, `CONTROLE REPASSE PROPRIETÁRIOS.xlsx`
- Aula 3: A lógica do repasse ao proprietário — Anexo: `CONTROLE REPASSE PROPRIETÁRIOS.xlsx`
- Aula 4: Repasse de proprietário via Stays
- Aula 5: Painel do proprietário via Stays
- Aula 6: Gestão de contas e despesas do proprietário
- Aula 7: Gestão de fluxo de caixa
- Aula 8: Como gerir e cobrar os valores caução
- Aula 9: Correção de preços nas plataformas
- Prestação de Contas e Repasse de proprietários (Live)

### Módulo 4 - Conexões com as plataformas — 8 aulas
- Aula 1: Como funciona um Channel Manager
- Aula 2: O que é um PMS?
- Aula 3: Como conectar com o Airbnb
- Aula 4: Como conectar com a Booking
- Aula 5: Como conectar com a Decolar
- Aula 6: Como conectar com as demais plataformas
- Aula 7: Como funciona a distribuição das promoções
- Aula bônus: Booking.com - Como criar um anúncio

### Módulo 5 - Gestão empresarial — 10 aulas
- Aula 1: Como gerir uma empresa de temporada
- Aula 2: A cabeça do gestor
- Aula 3: Viabilidade financeira do negócio — Anexo: `PLANILHA CONTROLE FINANCEIRO EMPRESA.xlsx`
- Aula 4: O que é floating financeiro
- Aula 5: Crie novas linhas de negócio
- Aula 6: Quanto se pagar de salário como dono do negócio?
- Aula 7: Análise de DRE
- Aula 8: Pague seus impostos
- Gestão financeira / Análise de DRE (Live)
- Como crescer de maneira sustentável e com qualidade (Live)

### Módulo 6 - Organizando as operações — 11 aulas
- Aula 0: Colocando ordem no caos — Anexo: `CONTROLE ADMINISTRATIVO DE APTOS GIGANTES.xlsx`
- Aula 1: Como eu organizo as propriedades no sistema
- Aula 2: Processo de vistoria entre reservas — Anexo: `VISTORIA PREVENTIVA.pdf`
- Aula 3: Gestão e divisão de tarefas
- Aula 4: Processos de check in
- Aula 5: Manual do hóspede
- Aula 6: Limpeza e arrumação
- Aula 7: Manutenção dos apartamentos
- Cobrança de caução e gestão de calendário (Live)
- Processos e rotinas do dia a dia (Live)
- Reservas diretas e prevenção a fraudes (Live)

### Módulo 7 - Atendimento aos hóspedes — 8 aulas
- Aula 1: Montando uma equipe de atendimento
- Aula 2: Estruturando o suporte ao hóspede
- Aula 3: Resolução de problemas no atendimento
- Aula 4: Processos, regras e protocolos
- Aula 5: Gestão de tarefas
- Aula 6: Acessos e permissões
- Aula 7: Como gerir reservas diretas
- Aula 8: Como funciona um software de gestão de atendimento

### Módulo 8 - Jurídico e administrativo — 7 aulas
- Aula 1: Validando a matrícula do imóvel
- Aula 2: Contrato de administração Parte 1 — Anexo: `MODELO CONTRATO ADMINISTRACAO.docx`, `MODELO DISTRATO PROPRIETÁRIO CURSO.docx`, `MODELO CONTRATO 2026.docx`
- Aula 3: Contrato de administração Parte 2 — Anexo: `MODELO DISTRATO PROPRIETÁRIO CURSO.docx`
- Aula 4: Assinatura digital
- Aula 5: Contrato com hóspedes/inquilinos — Anexo: `CONTRATO SIMPLES DE TEMPORADA.pdf`, `CONTRATO DE LOCAÇÃO RESIDENCIAL.docx`
- Aula 6: Garantias de locação
- Aula 7: Seguro de responsabilidade civil

### Módulo 9 - Comercial e Marketing — 5 aulas
- Aula 1: Como fazer o marketing da sua empresa
- Aula 2: Como fechar negócio com novos proprietários
- Aula 4: Como fazer uma apresentação irresistível para o proprietário — Anexo: `Rômulo Apresentação 2026.pdf`
- Aula 3: Captação direta de hóspedes
- Estratégias de venda com os proprietários (Live)

### Módulo 10 - Implantação dos imóveis — 5 aulas
- Aula 1: Projeto e arquitetura — Anexo: `Checklist - Itens essenciais.docx`
- Aula 2: Implantação do imóvel — Anexo: `LAUDO DE VISTORIA.docx`
- Aula 3: Brindes e amenidades
- Checklist de implantação de novos imóveis (Live)
- Erros ao mobiliar imóvel para a temporada (Live)

### Módulo 11 - Precificação dos imóveis — 7 aulas
- Aula 1: Quem define os preços?
- Aula 2: Gestão avançada de preços
- Aula 3: Precificação inteligente com Pricelabs
- Aula 4: Estruturação de anúncios pai e filho
- Masterclass: Pricelabs, com Joana Pires Coelho
- Passo a passo implementação Pricelabs (live)
- Descontos nativos Airbnb, Stays e Pricelabs (Live)

### Módulo 12 - Gestão de pessoas — 7 aulas
- Aula 1: Montando um time
- Aula 2: Quem faz o que?
- Aula 3: Construindo cultura
- Aula 4: Contratando pessoas
- Aula 5: Cargos e salários
- Cargos, salários e departamentos (Live)
- Como treinar equipe para o atendimento (Live) — Anexo: `controle-administrativo-de-aptos-gigantes.xlsx`

### Módulo 13 - Tecnologias — 9 aulas
- Owner Pro Business: Prestação de contas proprietário
- Hospy: Gestão de Check In facilitando o processo de documentação de hóspedes
- 360 Suites e o uso da Inteligência artificial
- New Byte: IA reinventando o atendimento
- Automação de Processos (API)
- Tecnologias do dia a dia (Atualização 2026)
- Tecnologias do dia a dia (Atualização 2025 - 2)
- Tecnologias do dia a dia (Atualização 2025)
- Tecnologias do dia a dia (Atualização 2024)

### 14. IAs para anfitriões e gestores — 3 aulas
- Aula: Como usar a IA para remoção de comentários
- IA exclusiva para remoção de comentários
- Inteligência Artificial: Farol da Qualidade

### 15. Masterclasses especiais — 8 aulas
- Masterlcass Vamos Gramado - Daniela e Vitor
- Masterclass Airbnb no Copan - Judson Sales
- Masterclass Carpediem Homes - Samuel Gondim
- Masterclass B.Homy - William Astolfi
- Masterclass 360 suítes - Debora e Vitor
- Masterclass Omar no Rio - Omar Farhat
- Masterclass Gestão de Imóveis de Luxo - Mariana Cavalieri e Thaísa Barcella
- Masterclass Estudo de rentabilidade usando dados com Joana Coelho do Pricelabs

### 16. Encontros mensais — 6 aulas
- Encontro abertura Gigantes - Turma 0
- Encontro Online de Gigantes - Turma 1
- Como a IA está reinventando o atendimento aos hóspedes (Fevereiro 2026)
- Como levantar dados e desempenho de uma cidade para Airbnb (Março 2026)
- Erros invisíveis que fazem o anfitrião/gestor demorar a crescer (Abril 2026)
- Tudo sobre a decisão do STJ e a polêmica do HIS e HMP (Maio 2026)

### 17. Imersão: Como estruturar uma empresa de temporada — 17 aulas
- 01 - Introdução à Imersão
- 02 - Como eu fui de 1 a 67 imóveis
- 03 - Os 4 pilares da gestão por temporada
- 04 - Devo abrir um CNPJ?
- 05 - Na conta de quem fica o anúncio: minha ou do proprietário?
- 06 - Quem paga o imposto desse Airbnb
- 07 - Modelos de negócio no Airbnb
- 08 - Estratégias de expansão
- 09 - Quanto cobrar de comissão
- 10 - Quais serviços prestar: enxoval e limpeza
- 11 - Q&A antes do almoço
- 12 - Contrato com o proprietário
- 13 - Mandamentos do gestor de temporada
- 14 - Comunidade Gigantes da Temporada: como vai funcionar
- 15 - Como eu capto proprietários – apresentação comercial
- 16 - Abrindo meu faturamento de 2024
- 17 - Q&A final

### 18. Imersão: Do Zero ao seu melhor anúncio no Airbnb — 21 aulas
- 01 - Introdução
- 02 - Oportunidades ao aprender Airbnb
- 03 - Os 3 Pilares
- 04 - Onde e como atuar
- 05 - Como extrair o máximo da plataforma do Airbnb
- 06 - Comunidade A5E
- 07 - Como montar um Anúncio preferido - Foto de Capa
- 08 - Como montar um Anúncio preferido - Mosaico
- 09 - Como montar um Anúncio preferido - Título
- 10 - Como montar um Anúncio preferido - Descrição
- 11 - Como montar um Anúncio preferido - Preço
- 12 - Como montar um Anúncio preferido - Avaliações
- 13 - Fim do bloco da manhã
- 14 - Ferramentas profissionais
- 15 - Como funciona o algoritmo do Airbnb
- 16 - Preferido dos hóspedes
- 17 - Aprendizados gerais
- 18 - Resultados do meu estudio de 19m²
- 19 - Meu faturamento no Airbnb
- 20 - Perguntas e respostas
- 21 - Análise de anuncios

### 19. Lives com Thaís Lima, arquiteta — 1 aula
- Arquitetura inteligente: O que evitar no seu imóvel para temporada (Março 2026)

### 20. Análise de Anúncios com Moisés Cassiano — 3 aulas
- Análise de Anúncios (Abril 2026)
- Análise de Anúncios (Maio 2026)
- Análise de anúncios (Junho 2026)

Fonte: "Mapa de Aulas e Anexos" (Nutror), atualizado em junho/2026.
$gig$
) on conflict (slug) do update
  set titulo = excluded.titulo, conteudo = excluded.conteudo, updated_at = now();
