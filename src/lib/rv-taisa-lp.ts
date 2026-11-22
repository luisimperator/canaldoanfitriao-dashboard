// Ordem do dia do Rômulo Visita com a Taisa Sanitá (#RV035), segunda 23/11/2026,
// no flat dela no Hotel Home Green Home, em Campos do Jordão:
// link.canaldoanfitriao.com.br/internos/rv-taisa (template em src/lib/rv-ordem-lp.ts).
// Fotos do anúncio do Airbnb em public/lp/rv-taisa/. Tempos de estrada estimados.

import { RV_DESLOC_HD_ROMULO, rvHoraMais, rvSomaMin, type Desloc, type OrdemDoDia } from "@/lib/rv-ordem-lp";

const IMG = "/lp/rv-taisa";
// Destino de carro (botões Google Maps/Waze/Uber). Tempos: minutos do OSRM pela regra única do template (rvTempoCarro).
const HGH = { endereco: "Home Green Home, R. Adolfo Torresim, 800 - Vila Inglesa, Campos do Jordão - SP", lat: -22.748697, lng: -45.5566314 };
const ANUNCIO = "https://www.airbnb.com.br/rooms/1161137307265883513";

// Trechos de carro (minutos OSRM). O texto dos cards não cita tempo: o número só sai do cardzinho.
const T_ESTRADA: Desloc = { carro: { osrm: 167.7, via: "estrada", picoSP: true }, trajeto: "Casa do Rômulo → Campos do Jordão" };
const T_VOLTA: Desloc = { carro: { osrm: 166.9, via: "estrada" }, trajeto: "Home Green Home → Casa do Rômulo" };
// Linha do tempo: cada chegada = saída + tempo do trecho.
const H_SAIDA = "08h00";
const H_ENCONTRO = rvHoraMais(H_SAIDA, RV_DESLOC_HD_ROMULO, false);
const H_ESTRADA = rvSomaMin(H_ENCONTRO, 15); // passar o equipamento pro carro do Rômulo
const H_VOLTA = "17h00";

export const RV_TAISA: OrdemDoDia = {
  expira: Date.parse("2026-11-30T00:00:00-03:00"),
  titulo: "Rômulo Visita · Taisa Sanitá · Segunda, 23/11",
  descricao: "Ordem do dia da gravação do Rômulo Visita com a Taisa Sanitá, em Campos do Jordão, segunda 23/11.",
  ogImg: `${IMG}/topo.webp`,
  hero: { src: `${IMG}/topo.webp`, alt: "Hotel Home Green Home no meio da mata, em Campos do Jordão", pos: "50% 45%", w: 1440, h: 810 },
  kicker: "Segunda, 23/11 · Campos do Jordão",
  nome: "Taisa Sanitá",
  lead: "Taisa, que alegria gravar com você! Aqui está o dia inteiro, da saída de São Paulo até a volta, com o seu flat no Home Green Home.",
  quando: [["Quando", "Segunda, 23/11"], ["Gravação", "14h00"], ["Onde", "Campos do Jordão"]],
  agendaNota: "Horários de estrada estimados pra uma segunda-feira. Se o trânsito mudar alguma coisa, a gente avisa pelo grupo.",
  agenda: [
    { hora: H_SAIDA, titulo: "Saída da Heavy Drops", texto: "A equipe sai de São Paulo com câmeras, luz e áudio.", icone: "🎒" },
    { hora: H_ENCONTRO, titulo: "Encontro com o Rômulo", texto: "Ainda em São Paulo, o time se junta ao Rômulo e segue no carro dele.", icone: "🤝", desloc: RV_DESLOC_HD_ROMULO },
    { hora: H_ESTRADA, titulo: "Pé na estrada", texto: "Ayrton Senna, Carvalho Pinto e a subida da serra, com uma parada no caminho.", icone: "🛣️" },
    { hora: rvHoraMais(H_ESTRADA, T_ESTRADA), titulo: "Chegada e almoço em Campos do Jordão", texto: "Tempo pra comer antes de começar.", icone: "🍽️", desloc: T_ESTRADA },
    { hora: "13h30", titulo: "Chegada no hotel", texto: "O flat fica pronto depois do check-out das 12h. Montagem de câmeras e luz, e um café com a Taisa.", icone: "🏨", desloc: { trajeto: "Almoço → Home Green Home" }, destino: HGH },
    { hora: "14h00", titulo: "Gravação · Flat no Home Green Home", texto: "O Rômulo conduz a conversa com a Taisa e a gente percorre o flat e o hotel.", icone: "🎬", destaque: true, foto: { src: `${IMG}/taisa-capa.webp`, alt: "Hotel Home Green Home" }, destino: HGH },
    { hora: H_VOLTA, titulo: "Saída de volta", texto: "Equipamento guardado e estrada de volta pra São Paulo.", icone: "👋" },
    { hora: rvHoraMais(H_VOLTA, T_VOLTA), titulo: "Chegada na casa do Rômulo", texto: "Fim do dia.", icone: "🌙", desloc: T_VOLTA },
  ],
  casas: [
    {
      id: "casa-1",
      rotulo: "Gravação · 14h00",
      nome: "Flat com vista pra montanha",
      endereco: "Hotel Home Green Home · Rua Adolfo, 800",
      endSub: "Alto do Capivari · Campos do Jordão · SP · estacionamento no local",
      link: ANUNCIO,
      fotos: [
        { src: `${IMG}/taisa-1.webp`, alt: "Fachada do Hotel Home Green Home no meio da mata" },
        { src: `${IMG}/taisa-2.webp`, alt: "Varanda com vista para a serra" },
        { src: `${IMG}/taisa-3.webp`, alt: "Entrada coberta do hotel" },
        { src: `${IMG}/taisa-4.webp`, alt: "Prédio e estacionamento do hotel" },
        { src: `${IMG}/taisa-5.webp`, alt: "Vista da varanda com neblina na serra" },
      ],
      resumo: "O flat da Taisa dentro do Home Green Home, um dos cartões-postais de Campos do Jordão. Varanda de frente pra serra, lareira e toda a estrutura do hotel em volta.",
    },
  ],
  fechoTitulo: "Até segunda, |Taisa!",
  fechoTexto: "Qualquer dúvida ou mudança, é só chamar no nosso grupo do WhatsApp. O Rômulo e o time estão animados pra conhecer a sua operação.",
  rodape: "Rômulo Visita · Taisa Sanitá · Segunda, 23/11/2026 · Campos do Jordão/SP",
};
