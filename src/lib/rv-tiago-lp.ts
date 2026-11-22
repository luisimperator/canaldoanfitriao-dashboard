// Ordem do dia do Rômulo Visita com o Tiago Bueno Diniz (Host Gestão, #RV025),
// segunda 07/12/2026, 13h às 16h:
// link.canaldoanfitriao.com.br/internos/rv-tiago (template em src/lib/rv-ordem-lp.ts).
// O local ainda está em definição (escritório em Alphaville, casa em Ubatuba ou
// studios em São Paulo), então os horários de deslocamento ficam em aberto.

import { RV_DESLOC_HD_ROMULO, type OrdemDoDia } from "@/lib/rv-ordem-lp";

const IMG = "/lp/rv-tiago";

export const RV_TIAGO: OrdemDoDia = {
  expira: Date.parse("2026-12-14T00:00:00-03:00"),
  titulo: "Rômulo Visita · Tiago Bueno Diniz · Segunda, 07/12",
  descricao: "Ordem do dia da gravação do Rômulo Visita com o Tiago Bueno Diniz, da Host Gestão, segunda 07/12.",
  ogImg: `${IMG}/topo.webp`,
  hero: { src: `${IMG}/topo.webp`, alt: "Escritório da Host Gestão com vista para os prédios", pos: "50% 50%", w: 1440, h: 1080 },
  kicker: "Segunda, 07/12 · Host Gestão",
  nome: "Tiago Bueno Diniz",
  lead: "Tiago, que alegria gravar com você e com o seu sócio! Aqui está a ordem do dia. O local a gente fecha com você pelo grupo, e aí esta página ganha os horários de deslocamento.",
  quando: [["Quando", "Segunda, 07/12"], ["Gravação", "13h00"], ["Onde", "A definir"]],
  agendaNota: "O local da gravação ainda está em definição. Assim que fechar, a gente atualiza os horários de saída e chegada.",
  agenda: [
    { hora: "A definir", titulo: "Saída da Heavy Drops", texto: "A equipe sai de São Paulo com câmeras, luz e áudio. O horário depende do local.", icone: "🎒" },
    { hora: "A definir", titulo: "Encontro com o Rômulo", texto: "O time se junta ao Rômulo e segue no carro dele.", icone: "🤝", desloc: RV_DESLOC_HD_ROMULO },
    { hora: "A definir", titulo: "Chegada no local", texto: "Montagem de câmeras e luz, e um café com o Tiago e o sócio.", icone: "📍", desloc: { trajeto: "Casa do Rômulo → local da gravação" } },
    { hora: "13h00", titulo: "Gravação · Host Gestão", texto: "O Rômulo conduz a conversa com o Tiago e o sócio. Cerca de 3h.", icone: "🎬", destaque: true, foto: { src: `${IMG}/escritorio-1.webp`, alt: "Escritório da Host Gestão" } },
    { hora: "16h00", titulo: "Fim da gravação", texto: "Equipamento guardado e volta.", icone: "👋" },
  ],
  casas: [
    {
      id: "escritorio",
      rotulo: "Uma das opções de local",
      nome: "Escritório da Host em Alphaville",
      endereco: "Alphaville",
      endSub: "Barueri · SP · endereço a confirmar",
      fotos: [
        { src: `${IMG}/escritorio-1.webp`, alt: "Recepção e área de trabalho do escritório" },
        { src: `${IMG}/escritorio-2.webp`, alt: "Equipe trabalhando no escritório" },
        { src: `${IMG}/escritorio-3.webp`, alt: "Sala com vista panorâmica" },
      ],
      resumo: "O escritório onde a equipe da Host cuida dos 61 imóveis. As outras opções são a casa pé na areia no Tenório, em Ubatuba, e os studios em São Paulo. O local final a gente fecha com você pelo grupo.",
    },
  ],
  fechoTitulo: "Até segunda, |Tiago!",
  fechoTexto: "Qualquer dúvida ou mudança, é só chamar no nosso grupo do WhatsApp. O Rômulo e o time estão animados pra conhecer a sua operação.",
  rodape: "Rômulo Visita · Tiago Bueno Diniz · Segunda, 07/12/2026",
};
