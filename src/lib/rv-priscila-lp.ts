// Ordem do dia do Rômulo Visita com a Priscila Araujo (#RV027), quarta 02/12/2026,
// nas casas dela no Vidigal (Rio de Janeiro), bate-volta de avião:
// link.canaldoanfitriao.com.br/internos/rv-priscila (template em src/lib/rv-ordem-lp.ts).
// Voos da reserva Azul TIE26F. Gravação às 13h30.

import { rvHoraMais, type Desloc, type OrdemDoDia } from "@/lib/rv-ordem-lp";

const IMG = "/lp/rv-priscila";
// Mapinhas de rota de cada trecho de carro (OSRM + OpenStreetMap em public/lp/rv-priscila/rota-*.webp);
// o clique abre a rota no Google Maps. Nome de lugar no título abre a ficha do lugar (campo lugar).
const SDU = "Aeroporto Santos Dumont, Rio de Janeiro - RJ";
const FILE_DO_LIRA = "Filé do Lira, Av. Ataulfo de Paiva, 658, Leblon, Rio de Janeiro - RJ";
const VIDIGAL = "Av. Presidente João Goulart, 906, Vidigal, Rio de Janeiro - RJ";
// Destinos de carro (botões Google Maps/Waze/Uber). Tempos: minutos do OSRM pela regra única do template (rvTempoCarro);
// o texto dos cards não cita tempo, o número só sai do cardzinho.
const D_SDU = { endereco: SDU, lat: -22.9104541, lng: -43.1641922 };
const D_FILE = { endereco: FILE_DO_LIRA, lat: -22.9851379, lng: -43.2259284 };
const D_VIDIGAL = { endereco: VIDIGAL, lat: -22.9964932, lng: -43.2404694 };
// Saída do Santos Dumont depois do desembarque e da retirada do equipamento e do carro; o almoço é a chegada no Filé do Lira.
const SAIDA_SDU = "10h00";
const fotos = (pre: string, alts: string[]) => alts.map((alt, i) => ({ src: `${IMG}/${pre}-${i + 1}.webp`, alt }));

// Do Santos Dumont direto pro Leblon (sem passar no Vidigal antes do almoço; Fernando, 21/11 23h47).
const T_SDU_FILE: Desloc = { carro: { osrm: 15.9, via: "urbano" }, trajeto: "Santos Dumont → Filé do Lira", mapa: { src: `${IMG}/rota-sdu-file.webp`, alt: "Rota do aeroporto Santos Dumont até o Filé do Lira, no Leblon", de: SDU, ate: FILE_DO_LIRA } };
const T_FILE_VIDIGAL: Desloc = { carro: { osrm: 5.2, via: "urbano" }, trajeto: "Filé do Lira → Vidigal", mapa: { src: `${IMG}/rota-file-vidigal.webp`, alt: "Rota do Filé do Lira de volta pras casas do Vidigal", de: FILE_DO_LIRA, ate: VIDIGAL } };
const T_VIDIGAL_SDU: Desloc = { carro: { osrm: 20.7, via: "urbano" }, trajeto: "Vidigal → Santos Dumont", mapa: { src: `${IMG}/rota-vidigal-sdu.webp`, alt: "Rota das casas do Vidigal até o aeroporto Santos Dumont", de: VIDIGAL, ate: SDU } };

export const RV_PRISCILA: OrdemDoDia = {
  expira: Date.parse("2026-12-09T00:00:00-03:00"),
  titulo: "Rômulo Visita · Priscila Araujo · Quarta, 02/12",
  descricao: "Ordem do dia da gravação do Rômulo Visita com a Priscila Araujo, no Vidigal (Rio de Janeiro), quarta 02/12.",
  ogImg: `${IMG}/topo.webp`,
  hero: { src: `${IMG}/topo.webp`, alt: "Terraço com hidro e vista para o mar, no Vidigal", pos: "50% 50%", w: 1440, h: 1706 },
  kicker: "Quarta, 02/12 · Vidigal · Rio de Janeiro",
  nome: "Priscila Araujo",
  lead: "Priscila, que alegria gravar com você! Aqui está o dia inteiro, do voo de ida até a volta pra São Paulo, com as casas do Vidigal.",
  quando: [["Quando", "Quarta, 02/12"], ["Voo de ida", "08h30"], ["Onde", "Vidigal · RJ"]],
  agendaNota: "Voos confirmados na Azul e gravação às 13h30. Os deslocamentos por terra são estimados.",
  agenda: [
    { hora: "06h30", titulo: "Encontro em Congonhas", texto: "A equipe e o Rômulo se encontram no aeroporto, com câmeras, luz e áudio.", icone: "🎒", destino: { endereco: "Aeroporto de Congonhas, São Paulo - SP", lat: -23.6274146, lng: -46.655561 }, lugar: { nome: "Congonhas", busca: "Aeroporto de Congonhas, São Paulo - SP" } },
    { hora: "08h30", titulo: "Voo pro Rio", texto: "Azul 4231, de Congonhas pro Santos Dumont.", icone: "✈️" },
    { hora: "09h30", titulo: "Pouso no Santos Dumont", texto: "Desembarque, retirada do equipamento e carro. Às 10h saímos direto pro Leblon.", icone: "🛬", lugar: { nome: "Santos Dumont", busca: SDU }, desloc: { modo: "aviao", tempo: "1h", minutos: 60, trajeto: "CGH → SDU", voo: "AZU4231" } },
    { hora: rvHoraMais(SAIDA_SDU, T_SDU_FILE), titulo: "Almoço no Filé do Lira", texto: "Av. Ataulfo de Paiva, 658, loja B, Leblon. Almoço com calma até a saída das 13h.", icone: "🍽️", lugar: { nome: "Filé do Lira", busca: FILE_DO_LIRA }, desloc: T_SDU_FILE, destino: D_FILE },
    { hora: "13h00", titulo: "Saída pro Vidigal", texto: "Do Leblon de volta pras casas.", icone: "🚗" },
    { hora: "13h30", titulo: "Gravação com a Priscila", texto: "O Rômulo conduz a conversa com a Priscila e a gente percorre as casas do terreno.", icone: "🎬", destaque: true, foto: { src: `${IMG}/vista-1.webp`, alt: "Terraço da casa com vista mar" }, desloc: T_FILE_VIDIGAL, destino: D_VIDIGAL },
    { hora: "~19h45", titulo: "Saída pro Santos Dumont", texto: "Com folga pro embarque.", icone: "🚗", lugar: { nome: "Santos Dumont", busca: SDU } },
    { hora: "21h00", titulo: "Voo de volta", texto: "Azul 6403, do Santos Dumont pra Congonhas.", icone: "✈️", desloc: T_VIDIGAL_SDU, destino: D_SDU },
    { hora: "22h10", titulo: "Pouso em Congonhas", texto: "Fim do dia.", icone: "🌙", lugar: { nome: "Congonhas", busca: "Aeroporto de Congonhas, São Paulo - SP" }, desloc: { modo: "aviao", tempo: "1h10", minutos: 70, trajeto: "SDU → CGH", voo: "AZU6403" } },
  ],
  casas: [
    {
      id: "casa-1",
      rotulo: "Vidigal · casa 1",
      nome: "Casa com vista mar, hidro e churrasqueira",
      endereco: "Av. Presidente João Goulart, 906",
      endSub: "Vidigal · Rio de Janeiro · RJ",
      link: "https://www.airbnb.com.br/rooms/46860100",
      fotos: fotos("vista", ["Terraço com hidro e vista para o mar", "Sala ampla com TV e janelões", "Sala com plantas e vista", "Parede com quadros do Rio", "Mesa de jantar redonda"]),
      resumo: "Uma das três casas da Priscila no mesmo terreno do Vidigal, com terraço de frente pro mar.",
    },
    {
      id: "casa-2",
      rotulo: "Vidigal · casa 2",
      nome: "Casa Branca Vidigal 2, com piscina",
      endereco: "Av. Presidente João Goulart, 906",
      endSub: "Vidigal · Rio de Janeiro · RJ",
      link: "https://www.airbnb.com.br/rooms/46865252",
      fotos: fotos("branca2", ["Terraço com churrasqueira e hidro", "Sala com sofá azul e mesa de jantar", "Sofá azul e porta para o terraço", "Sala de jantar com vista para o mar", "Sala com sofás e mesa de vidro"]),
      resumo: "No mesmo terreno, com área externa de piscina e churrasqueira.",
    },
    {
      id: "casa-3",
      rotulo: "Vidigal · casa 3",
      nome: "Casa Branca Vidigal 3",
      endereco: "Av. Presidente João Goulart, 906",
      endSub: "Vidigal · Rio de Janeiro · RJ",
      link: "https://www.airbnb.com.br/rooms/1309790238019995952",
      fotos: fotos("branca3", ["Corredor e sala", "Cozinha com azulejo azul", "Sala com TV", "Quarto de casal", "Banheiro"]),
      resumo: "A terceira casa do terreno, com 2 quartos.",
    },
  ],
  fechoTitulo: "Até quarta, |Priscila!",
  fechoTexto: "Qualquer dúvida ou mudança, é só chamar no nosso grupo do WhatsApp. O Rômulo e o time estão animados pra conhecer a sua operação.",
  rodape: "Rômulo Visita · Priscila Araujo · Quarta, 02/12/2026 · Vidigal, Rio de Janeiro/RJ",
};
