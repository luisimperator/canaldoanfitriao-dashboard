// Ordem do dia do Rômulo Visita com o Pedro Siqueira (Intelecto Stays, #RV028),
// quarta 09/12/2026, em Poços de Caldas/MG:
// link.canaldoanfitriao.com.br/internos/rv-pedro (template em src/lib/rv-ordem-lp.ts).
// Gravação na sede (agenda Gravações). Apartamento a visitar ainda a confirmar.
// Tempos de estrada estimados.

import type { OrdemDoDia } from "@/lib/rv-ordem-lp";

const IMG = "/lp/rv-pedro";
// Destino de carro (botões Google Maps/Waze/Uber); tempos de deslocamento por OSRM, sem trânsito.
const SEDE = { endereco: "Rua Sapucaí, 185 - São Benedito, Poços de Caldas - MG", lat: -21.791864, lng: -46.5600206 };

export const RV_PEDRO: OrdemDoDia = {
  expira: Date.parse("2026-12-16T00:00:00-03:00"),
  titulo: "Rômulo Visita · Pedro Siqueira · Quarta, 09/12",
  descricao: "Ordem do dia da gravação do Rômulo Visita com o Pedro Siqueira, da Intelecto Stays, em Poços de Caldas, quarta 09/12.",
  ogImg: `${IMG}/topo.webp`,
  hero: { src: `${IMG}/topo.webp`, alt: "Hidro no terraço com vista para Poços de Caldas e a serra", pos: "50% 50%", w: 1440, h: 1080 },
  kicker: "Quarta, 09/12 · Intelecto Stays",
  nome: "Pedro Siqueira",
  lead: "Pedro, que alegria gravar com você! Aqui está o dia inteiro, da saída de São Paulo até a volta, com a sede da Intelecto Stays em Poços de Caldas.",
  quando: [["Quando", "Quarta, 09/12"], ["Gravação", "14h00"], ["Onde", "Poços de Caldas"]],
  agendaNota: "Horários de estrada estimados pra uma quarta-feira. Se o trânsito mudar alguma coisa, a gente avisa pelo grupo.",
  agenda: [
    { hora: "07h30", titulo: "Saída da Heavy Drops", texto: "A equipe sai de São Paulo com câmeras, luz e áudio.", icone: "🎒" },
    { hora: "08h15", titulo: "Encontro com o Rômulo", texto: "Ainda em São Paulo, o time se junta ao Rômulo e segue no carro dele.", icone: "🤝", desloc: { trajeto: "Heavy Drops → Rômulo" } },
    { hora: "08h30", titulo: "Pé na estrada", texto: "Bandeirantes e as rodovias do interior até o sul de Minas, com uma parada rápida.", icone: "🛣️" },
    { hora: "~12h15", titulo: "Chegada em Poços de Caldas", texto: "Cerca de 3h45 de estrada, contando a parada.", icone: "⛰️", desloc: { tempo: "~3h30", trajeto: "São Paulo → Poços de Caldas" } },
    { hora: "12h30", titulo: "Almoço com calma", texto: "Tempo pra comer bem antes de começar.", icone: "🍽️" },
    { hora: "13h30", titulo: "Chegada na sede", texto: "Montagem de câmeras e luz, e um café com o Pedro.", icone: "🏢", desloc: { trajeto: "Almoço → Sede" }, destino: SEDE },
    { hora: "14h00", titulo: "Gravação · Intelecto Stays", texto: "O Rômulo conduz a conversa com o Pedro sobre a operação, a equipe e os imóveis.", icone: "🎬", destaque: true, foto: { src: `${IMG}/ap401-1.webp`, alt: "Apartamento da Intelecto Stays" } },
    { hora: "17h00", titulo: "Saída de volta", texto: "Equipamento guardado e estrada de volta pra São Paulo.", icone: "👋" },
    { hora: "~21h00", titulo: "Chegada em São Paulo", texto: "Fim do dia.", icone: "🌙", desloc: { tempo: "~3h30", trajeto: "Poços de Caldas → São Paulo" } },
  ],
  casas: [
    {
      id: "sede",
      rotulo: "Gravação · 14h00",
      nome: "Sede da Intelecto Stays",
      endereco: "Rua Sapucaí, 185",
      endSub: "São Benedito · Poços de Caldas · MG",
      fotos: [],
      resumo: "A base da operação, de onde a equipe cuida de quase 150 imóveis na cidade. Por enquanto a lavanderia própria também fica aqui.",
    },
    {
      id: "ap-401",
      rotulo: "Um dos apartamentos da operação",
      nome: "Ap 401 · central, com piscina e academia",
      endereco: "Centro de Poços de Caldas",
      endSub: "Poços de Caldas · MG · endereço exato a confirmar",
      link: "https://www.airbnb.com.br/rooms/1665359954714456858",
      fotos: [
        { src: `${IMG}/ap401-1.webp`, alt: "Sala integrada com cozinha americana" },
        { src: `${IMG}/ap401-2.webp`, alt: "Piscina no terraço do prédio" },
        { src: `${IMG}/ap401-3.webp`, alt: "Cama de casal" },
        { src: `${IMG}/ap401-4.webp`, alt: "Quarto com janela panorâmica" },
        { src: `${IMG}/ap401-5.webp`, alt: "Sala com sofá" },
      ],
      resumo: "Um dos anúncios que o Pedro mandou. Se a gente passar por algum apartamento no dia, ele é confirmado no grupo.",
    },
  ],
  fechoTitulo: "Até quarta, |Pedro!",
  fechoTexto: "Qualquer dúvida ou mudança, é só chamar no nosso grupo do WhatsApp. O Rômulo e o time estão animados pra conhecer a sua operação.",
  rodape: "Rômulo Visita · Pedro Siqueira · Quarta, 09/12/2026 · Poços de Caldas/MG",
};
