// Ordem do dia do Rômulo Visita com a Priscila Araujo (#RV027), quarta 02/12/2026,
// nas casas dela no Vidigal (Rio de Janeiro), bate-volta de avião:
// link.canaldoanfitriao.com.br/internos/rv-priscila (template em src/lib/rv-ordem-lp.ts).
// Voos da reserva Azul TIE26F. Horário da gravação ainda a combinar com a Priscila.

import type { OrdemDoDia } from "@/lib/rv-ordem-lp";

const IMG = "/lp/rv-priscila";
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
  agendaNota: "Voos confirmados na Azul. Os deslocamentos por terra são estimados, e o horário da gravação a gente fecha com você pelo grupo.",
  agenda: [
    { hora: "06h30", titulo: "Encontro em Congonhas", texto: "A equipe e o Rômulo se encontram no aeroporto, com câmeras, luz e áudio.", icone: "🎒" },
    { hora: "08h30", titulo: "Voo pro Rio", texto: "Azul 4231, de Congonhas pro Santos Dumont.", icone: "✈️" },
    { hora: "09h30", titulo: "Pouso no Santos Dumont", texto: "Desembarque e carro até o Vidigal.", icone: "🛬" },
    { hora: "~10h15", titulo: "Chegada no Vidigal", texto: "Uns 30 a 40 minutos do aeroporto, conforme o trânsito. Montagem de câmeras e luz.", icone: "🏡" },
    { hora: "A definir", titulo: "Gravação · Casas do Vidigal", texto: "O Rômulo conduz a conversa com a Priscila e a gente percorre as casas. Cerca de 3h, horário exato a combinar.", icone: "🎬", destaque: true, foto: { src: `${IMG}/vista-1.webp`, alt: "Terraço da casa com vista mar" } },
    { hora: "A definir", titulo: "Almoço", texto: "Encaixado antes ou depois da gravação, conforme o horário fechado.", icone: "🍽️" },
    { hora: "~19h45", titulo: "Saída pro Santos Dumont", texto: "Com folga pro embarque do voo de volta.", icone: "🚗" },
    { hora: "21h00", titulo: "Voo de volta", texto: "Azul 6403, do Santos Dumont pra Congonhas.", icone: "✈️" },
    { hora: "22h10", titulo: "Pouso em Congonhas", texto: "Fim do dia.", icone: "🌙" },
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
