// Ordem do dia do Rômulo Visita com a Priscila Araujo (#RV027), quarta 02/12/2026,
// nas casas dela no Vidigal (Rio de Janeiro), bate-volta de avião:
// link.canaldoanfitriao.com.br/internos/rv-priscila (template em src/lib/rv-ordem-lp.ts).
// Voos da reserva Azul TIE26F. Gravação às 13h30.

import type { OrdemDoDia } from "@/lib/rv-ordem-lp";

const IMG = "/lp/rv-priscila";
// Rotas dos cards (miniaturas OSRM + OpenStreetMap em public/lp/rv-priscila/priscila-rota-*.webp);
// o clique abre a rota no Google Maps.
const SDU = "Aeroporto Santos Dumont, Rio de Janeiro - RJ";
const FILE_DO_LIRA = "Filé do Lira, Av. Ataulfo de Paiva, 658, Leblon, Rio de Janeiro - RJ";
const VIDIGAL = "Av. Presidente João Goulart, 906, Vidigal, Rio de Janeiro - RJ";
// Destinos de carro (botões Google Maps/Waze/Uber); tempos de deslocamento por OSRM, sem trânsito.
const D_SDU = { endereco: SDU, lat: -22.9104541, lng: -43.1641922 };
const D_FILE = { endereco: FILE_DO_LIRA, lat: -22.9851379, lng: -43.2259284 };
const D_VIDIGAL = { endereco: VIDIGAL, lat: -22.9964932, lng: -43.2404694 };
const rotaGoogle = (de: string, ate: string) =>
  `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(de)}&destination=${encodeURIComponent(ate)}&travelmode=driving`;
const fotos = (pre: string, alts: string[]) => alts.map((alt, i) => ({ src: `${IMG}/${pre}-${i + 1}.webp`, alt }));

export const RV_PRISCILA: OrdemDoDia = {
  expira: Date.parse("2026-12-09T00:00:00-03:00"),
  titulo: "Rômulo Visita · Priscila Araujo · Quarta, 02/12",
  descricao: "Ordem do dia da gravação do Rômulo Visita com a Priscila Araujo, no Vidigal (Rio de Janeiro), quarta 02/12.",
  ogImg: `${IMG}/topo.webp`,
  hero: { src: `${IMG}/topo.webp`, alt: "Vista do terraço no Vidigal para o mar e a orla do Rio", pos: "50% 50%", w: 1440, h: 960 },
  kicker: "Quarta, 02/12 · Vidigal · Rio de Janeiro",
  nome: "Priscila Araujo",
  lead: "Priscila, que alegria gravar com você! Aqui está o dia inteiro, do voo de ida até a volta pra São Paulo, com as casas do Vidigal.",
  quando: [["Quando", "Quarta, 02/12"], ["Voo de ida", "08h30"], ["Onde", "Vidigal · RJ"]],
  agendaNota: "Voos confirmados na Azul e gravação às 13h30. Os deslocamentos por terra são estimados.",
  agenda: [
    { hora: "06h30", titulo: "Encontro em Congonhas", texto: "A equipe e o Rômulo se encontram no aeroporto, com câmeras, luz e áudio.", icone: "🎒", destino: { endereco: "Aeroporto de Congonhas, São Paulo - SP", lat: -23.6274146, lng: -46.655561 } },
    { hora: "08h30", titulo: "Voo pro Rio", texto: "Azul 4231, de Congonhas pro Santos Dumont.", icone: "✈️" },
    { hora: "09h30", titulo: "Pouso no Santos Dumont", texto: "Desembarque, retirada do equipamento e carro.", icone: "🛬", desloc: { modo: "aviao", tempo: "1h", trajeto: "CGH → SDU", voo: "AZU4231" } },
    { hora: "~10h15", titulo: "Chegada e descarga", texto: "Deslocamento estimado de 30 a 40 minutos, conforme o trânsito. Descarregamos o equipamento.", icone: "📦", desloc: { tempo: "~20 min", trajeto: "Santos Dumont → Vidigal" }, destino: D_VIDIGAL },
    { hora: "~11h30", titulo: "Almoço no Filé do Lira", texto: "Av. Ataulfo de Paiva, 658, loja B, Leblon.", icone: "🍽️", rota: { src: `${IMG}/priscila-rota-almoco.webp`, alt: "Rota do aeroporto Santos Dumont até o Filé do Lira, no Leblon", href: rotaGoogle(SDU, FILE_DO_LIRA) }, desloc: { tempo: "~5 min", trajeto: "Vidigal → Filé do Lira" }, destino: D_FILE },
    { hora: "13h00", titulo: "Saída pro Vidigal", texto: "Uns 15 a 20 minutos do Leblon (estimado).", icone: "🚗", rota: { src: `${IMG}/priscila-rota-vidigal.webp`, alt: "Rota do Filé do Lira até as casas da Priscila no Vidigal", href: rotaGoogle(FILE_DO_LIRA, VIDIGAL) } },
    { hora: "13h30", titulo: "Gravação com a Priscila", texto: "O Rômulo conduz a conversa com a Priscila e a gente percorre as casas do terreno.", icone: "🎬", destaque: true, foto: { src: `${IMG}/vista-1.webp`, alt: "Terraço da casa com vista mar" }, desloc: { tempo: "~5 min", trajeto: "Filé do Lira → Vidigal" }, destino: D_VIDIGAL },
    { hora: "~19h45", titulo: "Saída pro Santos Dumont", texto: "Deslocamento estimado de 40 minutos, com folga pro embarque.", icone: "🚗" },
    { hora: "21h00", titulo: "Voo de volta", texto: "Azul 6403, do Santos Dumont pra Congonhas.", icone: "✈️", desloc: { tempo: "~20 min", trajeto: "Vidigal → Santos Dumont" }, destino: D_SDU },
    { hora: "22h10", titulo: "Pouso em Congonhas", texto: "Fim do dia.", icone: "🌙", desloc: { modo: "aviao", tempo: "1h10", trajeto: "SDU → CGH", voo: "AZU6403" } },
  ],
  casas: [
    {
      id: "casa-1",
      rotulo: "Vidigal · casa 1",
      nome: "Casa com vista mar, hidro e churrasqueira",
      endereco: "Av. Presidente João Goulart, 906",
      endSub: "Vidigal · Rio de Janeiro · RJ",
      link: "https://www.airbnb.com.br/rooms/46860100",
      fotos: fotos("vista", ["Terraço com hidro e vista", "Sala ampla com plantas", "Sala de jantar integrada", "Deck com vista para o mar", "Quarto de casal"]),
      resumo: "Uma das três casas da Priscila no mesmo terreno do Vidigal, com terraço de frente pro mar.",
    },
    {
      id: "casa-2",
      rotulo: "Vidigal · casa 2",
      nome: "Casa Branca Vidigal 2, com piscina",
      endereco: "Av. Presidente João Goulart, 906",
      endSub: "Vidigal · Rio de Janeiro · RJ",
      link: "https://www.airbnb.com.br/rooms/46865252",
      fotos: fotos("branca2", ["Terraço com piscina e churrasqueira", "Sala com vista para o mar", "Sala com sofá azul", "Cozinha", "Quarto de casal"]),
      resumo: "No mesmo terreno, com área externa de piscina e churrasqueira.",
    },
    {
      id: "casa-3",
      rotulo: "Vidigal · casa 3",
      nome: "Casa Branca Vidigal 3",
      endereco: "Av. Presidente João Goulart, 906",
      endSub: "Vidigal · Rio de Janeiro · RJ",
      link: "https://www.airbnb.com.br/rooms/1309790238019995952",
      fotos: fotos("branca3", ["Corredor e sala", "Sala com TV", "Cozinha", "Quarto", "Sala de estar"]),
      resumo: "A terceira casa do terreno, com 2 quartos.",
    },
  ],
  fechoTitulo: "Até quarta, |Priscila!",
  fechoTexto: "Qualquer dúvida ou mudança, é só chamar no nosso grupo do WhatsApp. O Rômulo e o time estão animados pra conhecer a sua operação.",
  rodape: "Rômulo Visita · Priscila Araujo · Quarta, 02/12/2026 · Vidigal, Rio de Janeiro/RJ",
};
