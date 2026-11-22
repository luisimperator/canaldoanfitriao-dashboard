// Ordem do dia do Rômulo Visita com o Pedro Siqueira (Intelecto Stays, #RV028),
// quarta 09/12/2026, em Poços de Caldas/MG:
// link.canaldoanfitriao.com.br/internos/rv-pedro (template em src/lib/rv-ordem-lp.ts).
// Gravação na sede (agenda Gravações). Apartamento a visitar ainda a confirmar.
// Tempos de estrada estimados.

import { RV_DESLOC_HD_ROMULO, rvHoraMais, rvSomaMin, type Desloc, type OrdemDoDia } from "@/lib/rv-ordem-lp";

const IMG = "/lp/rv-pedro";
// Destino de carro (botões Google Maps/Waze/Uber). Tempos: minutos do OSRM pela regra única do template (rvTempoCarro).
const SEDE = { endereco: "Rua Sapucaí, 185 - São Benedito, Poços de Caldas - MG", lat: -21.791864, lng: -46.5600206 };

// Trechos de carro (minutos OSRM). O texto dos cards não cita tempo: o número só sai do cardzinho.
const T_ESTRADA: Desloc = { carro: { osrm: 203.1, via: "estrada", picoSP: true }, trajeto: "Casa do Rômulo → Poços de Caldas", mapa: { src: `${IMG}/rota-estrada.webp`, alt: "Rota de São Paulo até Poços de Caldas", de: "São Paulo - SP", ate: "Poços de Caldas - MG" } };
const T_VOLTA: Desloc = { carro: { osrm: 206.7, via: "estrada" }, trajeto: "Sede → Casa do Rômulo", mapa: { src: `${IMG}/rota-volta.webp`, alt: "Rota de Poços de Caldas de volta pra São Paulo", de: SEDE.endereco, ate: "São Paulo - SP" } };
// Linha do tempo: cada chegada = saída + tempo do trecho.
const H_SAIDA = "07h30";
const H_ENCONTRO = rvHoraMais(H_SAIDA, RV_DESLOC_HD_ROMULO, false);
const H_ESTRADA = rvSomaMin(H_ENCONTRO, 15); // passar o equipamento pro carro do Rômulo
const H_VOLTA = "17h00";

export const RV_PEDRO: OrdemDoDia = {
  expira: Date.parse("2026-12-16T00:00:00-03:00"),
  titulo: "Rômulo Visita · Pedro Siqueira · Quarta, 09/12",
  descricao: "Ordem do dia da gravação do Rômulo Visita com o Pedro Siqueira, da Intelecto Stays, em Poços de Caldas, quarta 09/12.",
  ogImg: `${IMG}/topo.webp`,
  hero: { src: `${IMG}/topo.webp`, alt: "Sala integrada do apartamento da Intelecto, em Poços de Caldas", pos: "50% 50%", w: 1440, h: 1080 },
  kicker: "Quarta, 09/12 · Intelecto Stays",
  nome: "Pedro Siqueira",
  lead: "Pedro, que alegria gravar com você! Aqui está o dia inteiro, da saída de São Paulo até a volta, com a sede da Intelecto Stays em Poços de Caldas.",
  quando: [["Quando", "Quarta, 09/12"], ["Gravação", "14h00"], ["Onde", "Poços de Caldas"]],
  agendaNota: "Horários de estrada estimados pra uma quarta-feira. Se o trânsito mudar alguma coisa, a gente avisa pelo grupo.",
  agenda: [
    { hora: H_SAIDA, titulo: "Saída da Heavy Drops", texto: "A equipe sai de São Paulo com câmeras, luz e áudio.", icone: "🎒", lugar: { nome: "Heavy Drops", busca: "Heavy Drops, Av. das Nações Unidas, 14401, Torre Tarumã, São Paulo - SP" } },
    { hora: H_ENCONTRO, titulo: "Encontro com o Rômulo", texto: "Ainda em São Paulo, o time se junta ao Rômulo e segue no carro dele.", icone: "🤝", desloc: RV_DESLOC_HD_ROMULO },
    { hora: H_ESTRADA, titulo: "Pé na estrada", texto: "Bandeirantes e as rodovias do interior até o sul de Minas, com uma parada no caminho.", icone: "🛣️" },
    { hora: rvHoraMais(H_ESTRADA, T_ESTRADA), titulo: "Chegada e almoço em Poços de Caldas", texto: "Tempo pra comer antes de começar.", icone: "🍽️", desloc: T_ESTRADA },
    { hora: "13h30", titulo: "Chegada na sede", texto: "Montagem de câmeras e luz, e um café com o Pedro.", icone: "🏢", desloc: { trajeto: "Almoço → Sede" }, destino: SEDE },
    { hora: "14h00", titulo: "Gravação · Intelecto Stays", texto: "O Rômulo conduz a conversa com o Pedro sobre a operação, a equipe e os imóveis.", icone: "🎬", destaque: true, foto: { src: `${IMG}/ap401-1.webp`, alt: "Apartamento da Intelecto Stays" }, destino: SEDE, lugar: { nome: "Intelecto Stays", busca: "Intelecto Stays, " + SEDE.endereco } },
    { hora: H_VOLTA, titulo: "Saída de volta", texto: "Equipamento guardado e estrada de volta pra São Paulo.", icone: "👋" },
    { hora: rvHoraMais(H_VOLTA, T_VOLTA), titulo: "Chegada na casa do Rômulo", texto: "Fim do dia.", icone: "🌙", desloc: T_VOLTA },
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
        { src: `${IMG}/ap401-2.webp`, alt: "Hidro no terraço com vista para a serra" },
        { src: `${IMG}/ap401-3.webp`, alt: "Sala com sofá" },
        { src: `${IMG}/ap401-4.webp`, alt: "Cama de casal" },
        { src: `${IMG}/ap401-5.webp`, alt: "Piscina no terraço do prédio" },
      ],
      resumo: "Um dos anúncios que o Pedro mandou. Se a gente passar por algum apartamento no dia, ele é confirmado no grupo.",
    },
  ],
  fechoTitulo: "Até quarta, |Pedro!",
  fechoTexto: "Qualquer dúvida ou mudança, é só chamar no nosso grupo do WhatsApp. O Rômulo e o time estão animados pra conhecer a sua operação.",
  rodape: "Rômulo Visita · Pedro Siqueira · Quarta, 09/12/2026 · Poços de Caldas/MG",
};
