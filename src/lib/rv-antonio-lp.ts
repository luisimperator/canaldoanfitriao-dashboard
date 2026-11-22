// Ordem do dia da gravação do Rômulo Visita com o Antonio Carlos (Praia &
// Montanha, São Sebastião/SP), quinta 17/12/2026:
// link.canaldoanfitriao.com.br/internos/rv-antonio (páginas internas ficam em /internos/)
//
// Página pro convidado e pra equipe: linha do tempo do dia, as duas casas
// (fotos do anúncio do Airbnb em public/lp/rv-antonio/) e o mapinha entre elas.
// Sem faturamento e sem endereço de São Paulo. Uma semana depois da gravação
// a rota passa a redirecionar pro YouTube do Canal (RV_ANTONIO_EXPIRA).

export const RV_ANTONIO_EXPIRA = Date.parse("2026-12-24T00:00:00-03:00");
export const RV_ANTONIO_DEPOIS = "https://www.youtube.com/@canaldoanfitriao";

import { rvDeslocHtml, rvNavHtml, RV_NAV_CSS, RV_DESLOC_HD_ROMULO, rvFmtDur, rvTempoCarro, rvHoraMais, rvSomaMin, type Desloc, type Destino } from "@/lib/rv-ordem-lp";

const IMG = "/lp/rv-antonio";

// ---------- conteúdo ----------
// Rotas dos cards (miniaturas OSRM + OpenStreetMap em public/lp/rv-antonio/antonio-rota-*.webp);
// o clique abre a rota no Google Maps.
const RESTAURANTE = "Família Restaurante, Av. Dr. Altino Arantes, 58, São Sebastião - SP";
const CASA_ANTONIO = "-23.77396,-45.40403"; // ponto aproximado do Airbnb (pino 1 do mapa.webp)
// Destinos de carro (botões Google Maps/Waze/Uber).
// Tempos de deslocamento: minutos do OSRM (trânsito livre) convertidos pela regra única do template (rvTempoCarro).
const D_RESTAURANTE = { endereco: RESTAURANTE, lat: -23.8023082, lng: -45.3984836 };
// Casa da piscina sem endereço: botões pela coordenada do mapinha.
const D_PISCINA: Destino = { nome: "Casa da piscina, São Sebastião - SP", lat: -23.77396, lng: -45.40403 };
const D_VISTA_MAR = { endereco: "Av. Dr. Manoel Hipólito do Rego, 399, Praia Deserta, São Sebastião - SP", lat: -23.7830304, lng: -45.398126 };
const rotaGoogle = (de: string, ate: string) =>
  `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(de)}&destination=${encodeURIComponent(ate)}&travelmode=driving`;

// Trechos de carro (minutos OSRM). O texto dos cards não cita tempo: o número só sai do cardzinho.
const T_ESTRADA: Desloc = { carro: { osrm: 184.9, via: "estrada", picoSP: true }, trajeto: "Casa do Rômulo → São Sebastião" };
const T_CASA: Desloc = { carro: { osrm: 6.2, via: "urbano" }, trajeto: "Família Restaurante → Casa da piscina" };
const T_PRAIA: Desloc = { carro: { osrm: 2.1, via: "urbano" }, trajeto: "Casa da piscina → Casa vista mar" };
const T_VOLTA: Desloc = { carro: { osrm: 171.3, via: "estrada" }, trajeto: "Casa vista mar → Casa do Rômulo" };
// Linha do tempo: cada chegada = saída + tempo do trecho.
const H_SAIDA = "07h30";
const H_ENCONTRO = rvHoraMais(H_SAIDA, RV_DESLOC_HD_ROMULO, false);
const H_ESTRADA = rvSomaMin(H_ENCONTRO, 15); // passar o equipamento pro carro do Rômulo
const H_VOLTA = "17h30";

const AGENDA: { hora: string; titulo: string; texto: string; icone: string; destaque?: boolean; foto?: { src: string; alt: string }; rota?: { src: string; alt: string; href: string }; destino?: Destino; desloc?: Desloc }[] = [
  { hora: H_SAIDA, titulo: "Saída da Heavy Drops", texto: "A equipe sai de São Paulo com câmeras, luz e áudio.", icone: "🎒" },
  { hora: H_ENCONTRO, titulo: "Encontro com o Rômulo", texto: "Ainda em São Paulo, o time se junta ao Rômulo.", icone: "🤝", desloc: RV_DESLOC_HD_ROMULO },
  { hora: H_ESTRADA, titulo: "Pé na estrada", texto: "Ayrton Senna, Carvalho Pinto e Tamoios, com uma parada no caminho.", icone: "🛣️" },
  { hora: rvHoraMais(H_ESTRADA, T_ESTRADA), titulo: "Chegada e almoço no Família Restaurante", texto: "Av. Dr. Altino Arantes, 58, na Rua da Praia, centro histórico de São Sebastião.", icone: "🍽️", rota: { src: `${IMG}/antonio-rota-almoco.webp`, alt: "Rota de São Paulo até o Família Restaurante, em São Sebastião", href: rotaGoogle("São Paulo - SP", RESTAURANTE) }, desloc: T_ESTRADA, destino: D_RESTAURANTE },
  { hora: "13h30", titulo: "Chegada na casa", texto: "Montagem de câmeras e luz, e um café com o Antonio.", icone: "🏡", rota: { src: `${IMG}/antonio-rota-casa.webp`, alt: "Rota do Família Restaurante até a casa do Antonio", href: rotaGoogle(RESTAURANTE, CASA_ANTONIO) }, desloc: T_CASA, destino: D_PISCINA },
  { hora: "14h00", titulo: "Gravação 1 · Casa da piscina", texto: "O Rômulo conduz a conversa com o Antonio e a gente percorre a casa.", icone: "🎬", destaque: true, foto: { src: `${IMG}/antonio-1.webp`, alt: "Casa da piscina" }, destino: D_PISCINA },
  { hora: "16h15", titulo: "Rumo à Praia Deserta", texto: "De carro até a segunda casa.", icone: "🚗" },
  { hora: "16h25", titulo: "Gravação 2 · Casa vista mar", texto: "Gravação curta, aproveitando a luz do fim de tarde.", icone: "🎬", destaque: true, foto: { src: `${IMG}/praia-1.webp`, alt: "Casa vista mar na Praia Deserta" }, desloc: T_PRAIA, destino: D_VISTA_MAR },
  { hora: H_VOLTA, titulo: "Saída de volta", texto: "Equipamento guardado e estrada de volta pra São Paulo.", icone: "👋" },
  { hora: rvHoraMais(H_VOLTA, T_VOLTA), titulo: "Chegada na casa do Rômulo", texto: "Fim do dia.", icone: "🌙", desloc: T_VOLTA },
];

const CASAS = [
  {
    id: "casa-1",
    rotulo: "Gravação 1 · 14h00",
    nome: "Piscina aquecida, hidro e praia",
    endereco: "São Sebastião, região central",
    endSub: "São Sebastião · SP",
    link: "https://www.airbnb.com.br/rooms/792732952506308495",
    fotos: [
      { src: `${IMG}/antonio-1.webp`, alt: "Área externa com piscina e gramado" },
      { src: `${IMG}/antonio-2.webp`, alt: "Quarto de casal" },
      { src: `${IMG}/antonio-3.webp`, alt: "Cozinha com bancada" },
      { src: `${IMG}/antonio-4.webp`, alt: "Banheiro" },
      { src: `${IMG}/antonio-5.webp`, alt: "Cadeiras de praia na areia" },
    ],
    resumo: "A casa do próprio Antonio, com piscina aquecida, hidro e a praia a poucos minutos. É aqui que o Rômulo conduz a conversa principal.",
  },
  {
    id: "casa-2",
    rotulo: "Gravação 2 · fim de tarde",
    nome: "Vista mar, pertinho da praia",
    endereco: "Av. Dr. Manoel Hipólito do Rego, 399",
    endSub: "Praia Deserta · São Sebastião · SP",
    link: "https://www.airbnb.com.br/rooms/1371160063089744305",
    fotos: [
      { src: `${IMG}/praia-1.webp`, alt: "Varanda envidraçada com vista para o mar e Ilhabela" },
      { src: `${IMG}/praia-2.webp`, alt: "Entrada com vista para a sala e o mar" },
      { src: `${IMG}/praia-3.webp`, alt: "Varanda com chuveiro e vista para o canal" },
      { src: `${IMG}/praia-4.webp`, alt: "Quarto com janela panorâmica" },
      { src: `${IMG}/praia-5.webp`, alt: "Cozinha completa" },
    ],
    resumo: "Varanda de vidro de frente pro canal de Ilhabela. A gente fecha o dia aqui, com a luz do fim da tarde.",
  },
];

// Posição dos pinos no mapa (% da imagem public/lp/rv-antonio/mapa.webp,
// OpenStreetMap z17 recortado em volta dos dois pontos aproximados do Airbnb).
const PINO = { casa1: { x: 40.94, y: 20.51 }, casa2: { x: 59.06, y: 79.49 } };

function grade(c: (typeof CASAS)[number]): string {
  const [g, ...p] = c.fotos;
  return `<div class="grade">
      <a class="f f0" href="${c.link}" target="_blank" rel="noopener"><img src="${g.src}" alt="${g.alt}" loading="lazy" width="1280" height="853"></a>
      ${p.map((f, i) => `<a class="f f${i + 1}" href="${c.link}" target="_blank" rel="noopener"><img src="${f.src}" alt="${f.alt}" loading="lazy" width="760" height="506"></a>`).join("\n      ")}
      <a class="todas" href="${c.link}" target="_blank" rel="noopener"><svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path fill="currentColor" d="M1 1h4v4H1zm5 0h4v4H6zm5 0h4v4h-4zM1 6h4v4H1zm5 0h4v4H6zm5 0h4v4h-4zM1 11h4v4H1zm5 0h4v4H6zm5 0h4v4h-4z"/></svg>Ver anúncio</a>
    </div>`;
}

function casa(c: (typeof CASAS)[number], n: number): string {
  return `<section class="casa bloco" id="${c.id}">
    <div class="casa-topo">
      <div>
        <p class="rot"><span class="num">${n}</span>${c.rotulo}</p>
        <h2>${c.nome}</h2>
      </div>
      <a class="chip-link" href="${c.link}" target="_blank" rel="noopener">Airbnb ↗</a>
    </div>
    ${grade(c)}
    <div class="casa-info">
      <div class="end"><i>📍</i><span><b>${c.endereco}</b>${c.endSub}</span></div>
      <p>${c.resumo}</p>
    </div>
  </section>`;
}

export function rvAntonioHtml(): string {
  const meio = { x: (PINO.casa1.x + PINO.casa2.x) / 2, y: (PINO.casa1.y + PINO.casa2.y) / 2 };
  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>Rômulo Visita · Antonio Carlos · Quinta, 17/12</title>
<meta name="description" content="Ordem do dia da gravação do Rômulo Visita com o Antonio Carlos, em São Sebastião, quinta 17/12.">
<meta name="robots" content="noindex, nofollow">
<meta property="og:title" content="Rômulo Visita · Antonio Carlos · Quinta, 17/12">
<meta property="og:description" content="A ordem do dia da gravação em São Sebastião.">
<meta property="og:image" content="https://link.canaldoanfitriao.com.br${IMG}/antonio-1.webp">
<meta name="theme-color" content="#0e0d10">
<link rel="icon" href="/icon-192.png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Plus+Jakarta+Sans:ital,wght@0,400;0,500;0,600;0,700;0,800;1,800&display=swap" rel="stylesheet">
<link rel="preload" as="image" href="${IMG}/praia-topo.webp">
<style>
:root{
  --coral:#ff385c;--rosa:#e61e4d;--vinho:#bd1e59;--pessego:#ff8a65;
  --noite:#0e0d10;--noite2:#17151a;--linha:rgba(255,255,255,.1);--cinza:#b9b3bd;
  --grad:linear-gradient(100deg,var(--pessego),var(--coral) 45%,var(--rosa) 75%,var(--vinho));
}
*{box-sizing:border-box}
html{-webkit-text-size-adjust:100%;scroll-behavior:smooth}
body{margin:0;background:var(--noite);color:#fff;font:16px/1.55 "Plus Jakarta Sans",system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;-webkit-font-smoothing:antialiased;overflow-x:hidden}
img{display:block;max-width:100%}
a{color:inherit}
.serif{font-family:"Instrument Serif",Georgia,serif;font-style:italic;font-weight:400}
.grad-txt{background:var(--grad);-webkit-background-clip:text;background-clip:text;color:transparent}
.wrap{width:min(1120px,100%);margin:0 auto;padding:0 clamp(20px,4vw,40px)}
.rot{display:flex;align-items:center;gap:10px;margin:0 0 8px;font-size:11px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:var(--coral)}
.rot .num{display:grid;place-items:center;width:24px;height:24px;border-radius:50%;background:var(--grad);color:#fff;font-size:12px;letter-spacing:0}
h2{margin:0;font-weight:800;font-size:clamp(24px,2.6vw,34px);line-height:1.1;letter-spacing:-.03em}
.bloco{padding:clamp(44px,7vh,80px) 0 0}

/* topo */
.hero{position:relative;min-height:min(92vh,760px);display:flex;align-items:flex-end;overflow:hidden}
.hero picture,.hero picture img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;object-position:62% 50%}
.hero:after{content:"";position:absolute;inset:0;background:linear-gradient(0deg,var(--noite) 2%,rgba(14,13,16,.55) 45%,rgba(14,13,16,.25) 75%,rgba(14,13,16,.6)),radial-gradient(70% 60% at 0% 100%,rgba(230,30,77,.28),transparent 70%)}
.hero .wrap{position:relative;z-index:2;padding-bottom:clamp(28px,6vh,60px)}
.topo{position:absolute;z-index:3;top:0;left:0;right:0;display:flex;align-items:center;justify-content:space-between;gap:16px;padding:22px clamp(20px,4vw,40px)}
.marca{display:flex;align-items:center;gap:10px;font-size:12px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:#fff}
.marca img{width:34px;height:34px;border-radius:9px}
.pill{display:inline-flex;align-items:center;gap:8px;font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;padding:8px 14px;border-radius:999px;border:1px solid rgba(255,56,92,.45);background:rgba(14,13,16,.55);backdrop-filter:blur(8px);white-space:nowrap}
.pill:before{content:"";width:8px;height:8px;border-radius:50%;background:var(--coral);box-shadow:0 0 0 0 rgba(255,56,92,.7);animation:pulso 1.8s infinite}
@keyframes pulso{70%{box-shadow:0 0 0 10px rgba(255,56,92,0)}100%{box-shadow:0 0 0 0 rgba(255,56,92,0)}}
.kicker{margin:0 0 10px;font-size:13px;font-weight:700;letter-spacing:.16em;text-transform:uppercase;color:#ffd9cf}
h1{margin:0;font-weight:800;font-size:clamp(40px,6.2vw,84px);line-height:.98;letter-spacing:-.04em;max-width:900px}
h1 .serif{font-size:1.1em;letter-spacing:-.01em}
.lead{margin:18px 0 0;font-size:clamp(16px,1.3vw,19px);color:#e9e4ea;max-width:620px}
.quando{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;max-width:660px;margin-top:26px}
.quando div{background:rgba(23,21,26,.78);backdrop-filter:blur(8px);border:1px solid var(--linha);border-radius:16px;padding:11px 15px}
.quando small{display:block;font-size:10.5px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:var(--coral)}
.quando b{display:block;font-size:clamp(17px,1.6vw,22px);font-weight:800;letter-spacing:-.02em;line-height:1.25}

/* linha do tempo */
.agenda-cab{display:flex;align-items:flex-end;justify-content:space-between;gap:20px;flex-wrap:wrap;margin-bottom:26px}
.agenda-cab p{margin:6px 0 0;color:var(--cinza);max-width:520px;font-size:15px}
.tl{list-style:none;margin:0;padding:0;position:relative;display:grid;gap:10px}
.tl:before{content:"";position:absolute;left:107px;top:14px;bottom:14px;width:2px;background:linear-gradient(180deg,var(--pessego),var(--coral) 40%,var(--vinho));opacity:.55;border-radius:2px}
.tl li{display:grid;grid-template-columns:84px 46px minmax(0,1fr);align-items:center;gap:0}
.tl .h{font-size:17px;font-weight:800;letter-spacing:-.02em;text-align:right;padding-right:12px;font-variant-numeric:tabular-nums}
.tl .ic{position:relative;z-index:1;justify-self:center;display:grid;place-items:center;width:38px;height:38px;border-radius:50%;background:var(--noite2);border:1px solid rgba(255,255,255,.16);font-size:17px}
.tl .c{margin-left:10px;padding:12px 16px;border-radius:16px;background:var(--noite2);border:1px solid var(--linha)}
.tl .c b{display:block;font-size:16px;letter-spacing:-.01em}
.tl .c span{display:block;font-size:14px;color:var(--cinza);line-height:1.45}
${RV_NAV_CSS}
.tl .c a.ver-rota{display:inline-block;margin-top:6px;font-size:13px;font-weight:700;color:#ffb4a2;text-decoration:none}
.tl .c a.mini-rota{flex:none;display:block;line-height:0}
.tl .c a.mini-rota .mini{width:96px;height:72px}
.tl li.on .ic{background:var(--grad);border-color:transparent;box-shadow:0 10px 26px -10px rgba(230,30,77,.9)}
.tl li.on .c{background:linear-gradient(100deg,rgba(255,138,101,.16),rgba(189,30,89,.1));border-color:rgba(255,56,92,.4)}
.tl li.on .h{color:#ffb4a2}
.tl .c.tem-foto{display:flex;align-items:center;gap:12px}
.tl .c.tem-foto>div{flex:1;min-width:0}
.tl .c .mini{flex:none;width:72px;height:72px;border-radius:12px;object-fit:cover;border:1px solid rgba(255,255,255,.18);box-shadow:0 8px 20px -10px rgba(0,0,0,.8)}
.obs{margin:14px 0 0 140px;font-size:13px;color:#8f8893}

/* casas */
.casa-topo{display:flex;align-items:flex-end;justify-content:space-between;gap:16px;margin-bottom:18px}
.chip-link{flex:none;font-size:13px;font-weight:700;text-decoration:none;padding:9px 15px;border-radius:999px;background:#fff;color:var(--noite);transition:transform .2s}
.chip-link:hover{transform:translateY(-2px)}
.grade{position:relative;display:grid;grid-template-columns:2fr 1fr 1fr;grid-template-rows:1fr 1fr;gap:8px;height:clamp(300px,44vw,480px);border-radius:18px;overflow:hidden}
.grade .f{position:relative;overflow:hidden;background:#1d1a1f}
.grade .f0{grid-row:1/3}
.grade img{width:100%;height:100%;object-fit:cover;transition:transform .5s cubic-bezier(.2,.8,.2,1),filter .3s}
.grade .f:hover img{transform:scale(1.04);filter:brightness(.92)}
.todas{position:absolute;right:14px;bottom:14px;display:inline-flex;align-items:center;gap:8px;font-size:13.5px;font-weight:700;text-decoration:none;color:var(--noite);background:#fff;border:1px solid #222;border-radius:9px;padding:7px 13px;box-shadow:0 6px 18px -8px rgba(0,0,0,.6)}
.casa-info{display:grid;grid-template-columns:minmax(0,.9fr) minmax(0,1.1fr);gap:14px;margin-top:16px;align-items:center}
.casa-info p{margin:0;color:#d9d4dc;font-size:15.5px}
.end{display:flex;gap:12px;align-items:center;padding:13px 16px;border-radius:16px;background:var(--noite2);border:1px solid var(--linha);font-size:13.5px;color:var(--cinza)}
.end i{font-style:normal;font-size:22px}
.end b{display:block;color:#fff;font-size:15.5px}

/* mapa */
.mapa-box{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:22px;align-items:center}
.mapa-txt p{color:var(--cinza);margin:10px 0 0;font-size:15.5px}
.tempo{display:inline-flex;align-items:baseline;gap:8px;margin-top:18px;padding:12px 18px;border-radius:16px;background:linear-gradient(90deg,rgba(255,138,101,.14),rgba(189,30,89,.08));border:1px solid rgba(255,138,101,.3)}
.tempo b{font-size:30px;font-weight:800;letter-spacing:-.03em}
.tempo span{font-size:14px;color:#e9e4ea}
.mapa{position:relative;border-radius:20px;overflow:hidden;border:1px solid var(--linha);aspect-ratio:1/1;background:#e9e5dc;box-shadow:0 30px 60px -30px rgba(0,0,0,.8)}
.mapa>img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;filter:saturate(.75) contrast(1.02)}
.mapa:after{content:"";position:absolute;inset:0;pointer-events:none;box-shadow:inset 0 0 70px rgba(14,13,16,.35)}
.mapa svg{position:absolute;inset:0;width:100%;height:100%;overflow:visible}
.rota{fill:none;stroke:var(--rosa);stroke-width:4;stroke-linecap:round;stroke-dasharray:2 11;animation:anda 1.2s linear infinite}
.rota-sombra{fill:none;stroke:#fff;stroke-width:9;stroke-linecap:round;opacity:.8}
@keyframes anda{to{stroke-dashoffset:-13}}
.pino{position:absolute;z-index:2;transform:translate(-50%,-100%);display:flex;flex-direction:column;align-items:center}
.pino .et{white-space:nowrap;font-size:12.5px;font-weight:800;color:#fff;background:var(--noite);border-radius:999px;padding:6px 11px;box-shadow:0 8px 20px -8px rgba(0,0,0,.6);display:flex;align-items:center;gap:7px}
.pino .et i{font-style:normal;display:grid;place-items:center;width:19px;height:19px;border-radius:50%;background:var(--grad);font-size:11px}
.pino .pt{width:16px;height:16px;margin-top:6px;border-radius:50%;background:var(--coral);border:3px solid #fff;box-shadow:0 0 0 6px rgba(255,56,92,.25)}
.pino.p1 .pt{margin-top:6px}
.min{position:absolute;z-index:2;transform:translate(-50%,-50%);display:flex;align-items:center;gap:6px;font-size:13px;font-weight:800;color:var(--noite);background:#fff;border-radius:999px;padding:6px 12px;border:2px solid var(--rosa);box-shadow:0 10px 24px -10px rgba(0,0,0,.6)}
.credito{position:absolute;z-index:2;right:8px;bottom:6px;font-size:10px;color:#555;background:rgba(255,255,255,.75);padding:1px 6px;border-radius:4px}

/* fecho */
.fecho{margin-top:clamp(50px,8vh,90px);padding:clamp(28px,4vw,44px);border-radius:24px;background:radial-gradient(60% 80% at 0% 0%,rgba(230,30,77,.25),transparent 70%),var(--noite2);border:1px solid var(--linha);display:flex;gap:24px;align-items:center;justify-content:space-between;flex-wrap:wrap}
.fecho h3{margin:0;font-size:clamp(24px,2.6vw,34px);font-weight:800;letter-spacing:-.03em;line-height:1.1}
.fecho p{margin:8px 0 0;color:var(--cinza);max-width:560px}
.rodape{display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-top:40px;padding:18px 0 30px;font-size:12.5px;color:#8f8893;border-top:1px solid var(--linha)}

/* entrada suave */
.rv{opacity:0;transform:translateY(14px);animation:sobe .7s cubic-bezier(.2,.8,.2,1) forwards;animation-delay:var(--d,0s)}
@keyframes sobe{to{opacity:1;transform:none}}
@media (prefers-reduced-motion:reduce){.rv{opacity:1;transform:none;animation:none}.pill:before,.rota{animation:none}}

@media (max-width:760px){
  .hero{min-height:auto;padding-top:min(70vw,420px)}
  .hero:after{background:linear-gradient(0deg,var(--noite) 18%,rgba(14,13,16,.7) 50%,rgba(14,13,16,.15) 78%,rgba(14,13,16,.55))}
  .topo{padding:16px 18px}
  .marca{font-size:11px}
  .marca img{width:30px;height:30px}
  .pill{font-size:11px;padding:7px 11px}
  .lead{margin-top:14px}
  .quando{gap:8px;margin-top:20px}
  .quando div{padding:10px 11px}
  .quando b{font-size:16px}
  .tl:before{left:73px}
  .tl li{grid-template-columns:58px 32px minmax(0,1fr)}
  .tl .h{font-size:14px;padding-right:8px}
  .tl .ic{width:30px;height:30px;font-size:14px}
  .tl .c{margin-left:8px;padding:10px 13px}
  .tl .c b{font-size:15px}
  .tl .c span{font-size:13px}
  .tl .c a.mini-rota .mini{width:84px;height:64px;border-radius:11px}
  .tl .c .mini{width:64px;height:64px;border-radius:11px}
  .tl .c.tem-foto{gap:10px;padding-right:10px}
  .obs{margin-left:0}
  .grade{grid-template-columns:1fr 1fr;grid-template-rows:2fr 1fr 1fr;height:auto;aspect-ratio:3/4}
  .grade .f0{grid-row:auto;grid-column:1/3}
  .casa-info{grid-template-columns:1fr}
  .mapa-box{grid-template-columns:1fr}
  .pino .et{font-size:11px;padding:5px 9px}
  .min{font-size:12px;padding:5px 10px}
  .rodape{justify-content:center;text-align:center}
}
</style>
</head>
<body>
<header class="hero">
  <picture><img src="${IMG}/praia-topo.webp" alt="Vista para o mar e Ilhabela da casa da Praia Deserta" width="1440" height="1080" fetchpriority="high"></picture>
  <div class="topo">
    <div class="marca"><img src="/marca/cda-icone.png" alt="" width="34" height="34">Canal do Anfitrião</div>
    <span class="pill">Ordem do dia</span>
  </div>
  <div class="wrap">
    <p class="kicker rv" style="--d:.04s">Quinta, 17/12 · Praia &amp; Montanha</p>
    <h1 class="rv" style="--d:.08s">Rômulo Visita <span class="serif grad-txt">Antonio Carlos</span></h1>
    <p class="lead rv" style="--d:.14s">Antonio, que alegria gravar com você! Aqui está o dia inteiro, da saída de São Paulo até a volta, com as duas casas que a gente vai visitar em São Sebastião.</p>
    <div class="quando rv" style="--d:.2s">
      <div><small>Quando</small><b>Quinta, 17/12</b></div>
      <div><small>Gravação</small><b>14h00</b></div>
      <div><small>Onde</small><b>São Sebastião</b></div>
    </div>
  </div>
</header>

<main class="wrap">
  <section class="bloco" id="agenda">
    <div class="agenda-cab">
      <div>
        <p class="rot">O dia</p>
        <h2>Linha do <span class="serif grad-txt">tempo</span></h2>
      </div>
      <p>Horários de estrada estimados pra uma quinta-feira. Se o trânsito mudar alguma coisa, a gente avisa pelo grupo.</p>
    </div>
    <ol class="tl">
      ${AGENDA.map((a) => `${rvDeslocHtml(a.desloc)}<li${a.destaque ? ' class="on"' : ""}><span class="h">${a.hora}</span><span class="ic">${a.icone}</span>${a.rota ? `<div class="c tem-foto"><div><b>${a.titulo}</b><span>${a.texto}</span><a class="ver-rota" href="${a.rota.href.replace(/&/g, "&amp;")}" target="_blank" rel="noopener">Ver rota no mapa ↗</a></div><a class="mini-rota" href="${a.rota.href.replace(/&/g, "&amp;")}" target="_blank" rel="noopener" aria-label="Abrir rota no Google Maps"><img class="mini" src="${a.rota.src}" alt="${a.rota.alt}" loading="lazy" width="96" height="72"></a>${rvNavHtml(a.destino)}</div>` : a.foto ? `<div class="c tem-foto"><div><b>${a.titulo}</b><span>${a.texto}</span></div><img class="mini" src="${a.foto.src}" alt="${a.foto.alt}" loading="lazy" width="72" height="72">${rvNavHtml(a.destino)}</div>` : `<div class="c"><b>${a.titulo}</b><span>${a.texto}</span>${rvNavHtml(a.destino)}</div>`}</li>`).join("\n      ")}
    </ol>
  </section>

  ${casa(CASAS[0], 1)}

  <section class="bloco" id="mapa">
    <div class="mapa-box">
      <div class="mapa-txt">
        <p class="rot">Entre as casas</p>
        <h2>Pertinho, <span class="serif grad-txt">de uma pra outra</span></h2>
        <p>Depois da primeira gravação, a gente desce até a Praia Deserta pra fechar o dia na casa com vista pro canal de Ilhabela.</p>
        <div class="tempo"><b>${rvFmtDur(rvTempoCarro(T_PRAIA.carro!).min)}</b><span>de carro · uns 2 km</span></div>
      </div>
      <div class="mapa">
        <img src="${IMG}/mapa.webp" alt="Mapa de São Sebastião com as duas casas" loading="lazy" width="1200" height="1200">
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          <path class="rota-sombra" vector-effect="non-scaling-stroke" d="M${PINO.casa1.x} ${PINO.casa1.y} C ${PINO.casa1.x + 14} ${PINO.casa1.y + 22}, ${PINO.casa2.x - 14} ${PINO.casa2.y - 26}, ${PINO.casa2.x} ${PINO.casa2.y}"/>
          <path class="rota" vector-effect="non-scaling-stroke" d="M${PINO.casa1.x} ${PINO.casa1.y} C ${PINO.casa1.x + 14} ${PINO.casa1.y + 22}, ${PINO.casa2.x - 14} ${PINO.casa2.y - 26}, ${PINO.casa2.x} ${PINO.casa2.y}"/>
        </svg>
        <div class="pino p1" style="left:${PINO.casa1.x}%;top:${PINO.casa1.y + 1.6}%"><span class="et"><i>1</i>Casa da piscina</span><span class="pt"></span></div>
        <div class="pino p2" style="left:${PINO.casa2.x}%;top:${PINO.casa2.y + 1.6}%"><span class="et"><i>2</i>Casa vista mar</span><span class="pt"></span></div>
        <span class="min" style="left:${meio.x}%;top:${meio.y}%">🚗 ${rvFmtDur(rvTempoCarro(T_PRAIA.carro!).min)}</span>
        <span class="credito">© OpenStreetMap</span>
      </div>
    </div>
  </section>

  ${casa(CASAS[1], 2)}

  <section class="fecho">
    <div>
      <h3>Até quinta, <span class="serif grad-txt">Antonio!</span></h3>
      <p>Qualquer dúvida ou mudança, é só chamar no nosso grupo do WhatsApp. O Rômulo e o time estão animados pra conhecer a sua operação.</p>
    </div>
  </section>

  <footer class="rodape">
    <span>Rômulo Visita · Antonio Carlos · Quinta, 17/12/2026 · São Sebastião/SP</span>
    <span>Canal do Anfitrião</span>
  </footer>
</main>
</body>
</html>
`;
}
