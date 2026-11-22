// Ordem do dia do Rômulo Visita com a Taisa Sanitá (#RV035), segunda 23/11/2026,
// no flat dela no Hotel Home Green Home, em Campos do Jordão:
// link.canaldoanfitriao.com.br/internos/rv-taisa (template em src/lib/rv-ordem-lp.ts).
// Fotos do anúncio do Airbnb em public/lp/rv-taisa/. Tempos de estrada estimados.

import type { OrdemDoDia } from "@/lib/rv-ordem-lp";

const IMG = "/lp/rv-taisa";
// Destino de carro (botões Google Maps/Waze/Uber); tempos de deslocamento por OSRM, sem trânsito.
const HGH = { endereco: "Home Green Home, R. Adolfo Torresim, 800 - Vila Inglesa, Campos do Jordão - SP", lat: -22.748697, lng: -45.5566314 };
const ANUNCIO = "https://www.airbnb.com.br/rooms/1161137307265883513";

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
    { hora: "08h00", titulo: "Saída da Heavy Drops", texto: "A equipe sai de São Paulo com câmeras, luz e áudio.", icone: "🎒" },
    { hora: "08h45", titulo: "Encontro com o Rômulo", texto: "Ainda em São Paulo, o time se junta ao Rômulo e segue no carro dele.", icone: "🤝", desloc: { trajeto: "Heavy Drops → Rômulo" } },
    { hora: "09h00", titulo: "Pé na estrada", texto: "Ayrton Senna, Carvalho Pinto e a subida da serra, com uma parada rápida no caminho.", icone: "🛣️" },
    { hora: "~12h00", titulo: "Chegada em Campos do Jordão", texto: "Cerca de 3h de estrada numa segunda de manhã.", icone: "🏔️", desloc: { tempo: "~2h45", trajeto: "São Paulo → Campos do Jordão" } },
    { hora: "12h15", titulo: "Almoço com calma", texto: "Tempo pra comer bem antes de começar.", icone: "🍽️" },
    { hora: "13h30", titulo: "Chegada no hotel", texto: "O flat fica pronto depois do check-out das 12h. Montagem de câmeras e luz, e um café com a Taisa.", icone: "🏨", desloc: { trajeto: "Almoço → Home Green Home" }, destino: HGH },
    { hora: "14h00", titulo: "Gravação · Flat no Home Green Home", texto: "O Rômulo conduz a conversa com a Taisa e a gente percorre o flat e o hotel.", icone: "🎬", destaque: true, foto: { src: `${IMG}/taisa-capa.webp`, alt: "Hotel Home Green Home" } },
    { hora: "17h00", titulo: "Saída de volta", texto: "Equipamento guardado e estrada de volta pra São Paulo.", icone: "👋" },
    { hora: "~20h30", titulo: "Chegada em São Paulo", texto: "Fim do dia.", icone: "🌙", desloc: { tempo: "~2h45", trajeto: "Campos do Jordão → São Paulo" } },
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
        { src: `${IMG}/taisa-1.webp`, alt: "Varanda com vista para a serra" },
        { src: `${IMG}/taisa-2.webp`, alt: "Sala com lareira" },
        { src: `${IMG}/taisa-3.webp`, alt: "Quarto com mesa e janela para a varanda" },
        { src: `${IMG}/taisa-4.webp`, alt: "Piscina coberta do hotel" },
        { src: `${IMG}/taisa-5.webp`, alt: "Vista da varanda com neblina na serra" },
      ],
      resumo: "O flat da Taisa dentro do Home Green Home, um dos cartões-postais de Campos do Jordão. Varanda de frente pra serra, lareira e toda a estrutura do hotel em volta.",
    },
  ],
  fechoTitulo: "Até segunda, |Taisa!",
  fechoTexto: "Qualquer dúvida ou mudança, é só chamar no nosso grupo do WhatsApp. O Rômulo e o time estão animados pra conhecer a sua operação.",
  rodape: "Rômulo Visita · Taisa Sanitá · Segunda, 23/11/2026 · Campos do Jordão/SP",
};
