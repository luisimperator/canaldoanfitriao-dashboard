// Ordem do dia do Rômulo Visita: template das páginas internas
// link.canaldoanfitriao.com.br/internos/rv-<convidado> (mesmo visual da
// /internos/rv-antonio). Cada convidado tem um arquivo src/lib/rv-<nome>-lp.ts
// com o conteúdo (OrdemDoDia) e uma rota em src/app/internos/rv-<nome>/route.ts.
// Sem faturamento. Endereço em São Paulo só os dois fixos abaixo (HD e Rômulo). Uma semana depois da gravação
// a rota redireciona pro YouTube do Canal (expira).

export const RV_DEPOIS = "https://www.youtube.com/@canaldoanfitriao";

export type Passo = { hora: string; titulo: string; texto: string; icone: string; destaque?: boolean; foto?: { src: string; alt: string };
  // Miniatura de mapa com a rota do deslocamento (imagem OSRM + OSM); o clique abre `href` (Google Maps).
  rota?: { src: string; alt: string; href: string };
  // Destino a que se chega de carro: mostra os botõezinhos Google Maps, Waze e Uber. Sem endereço, não põe.
  destino?: Destino;
  // Trecho que CHEGA neste passo: cardzinho de deslocamento desenhado antes dele na linha do tempo.
  desloc?: Desloc };
export type Destino = { endereco: string; lat?: number; lng?: number };

// Pontos fixos de saída de toda ordem do dia (São Paulo). Coordenadas do OSM (Nominatim).
// HD → Rômulo por OSRM: 15 km, ~22 min sem trânsito. A estrada até o destino sai da casa do Rômulo.
export const RV_END_HD: Destino = { endereco: "Av. das Nações Unidas, 14401, Torre Tarumã, cj. 2804, São Paulo - SP", lat: -23.6257074, lng: -46.7056935 };
export const RV_END_ROMULO: Destino = { endereco: "Rua Martim Burchard, 187, Brás, São Paulo - SP", lat: -23.5456485, lng: -46.6181279 };
export const RV_DESLOC_HD_ROMULO: Desloc = { tempo: "~20 min", trajeto: "Heavy Drops → Rômulo" };
// tempo: estimado por OSRM (dirigindo), arredondado e com "~"; voo com o horário da reserva. Sem tempo = "tempo a definir".
// voo: código ICAO do voo (AZU+número Azul, GLO Gol, TAM LATAM) pro botão "Status do voo" no FlightAware.
export type Desloc = { modo?: "carro" | "aviao"; tempo?: string; trajeto: string; voo?: string };

export function rvVooLink(voo: string): string {
  return `https://www.flightaware.com/live/flight/${encodeURIComponent(voo.replace(/\s+/g, "").toUpperCase())}`;
}

export function rvNavLinks(d: Destino): { google: string; waze: string; uber: string } {
  const temPonto = d.lat !== undefined && d.lng !== undefined;
  const end = encodeURIComponent(d.endereco);
  return {
    google: `https://www.google.com/maps/dir/?api=1&destination=${end}`,
    waze: temPonto ? `https://waze.com/ul?ll=${d.lat},${d.lng}&navigate=yes` : `https://waze.com/ul?q=${end}&navigate=yes`,
    uber: `https://m.uber.com/ul/?action=setPickup&pickup=my_location&dropoff[formatted_address]=${end}` +
      (temPonto ? `&dropoff[latitude]=${d.lat}&dropoff[longitude]=${d.lng}` : ""),
  };
}

export function rvNavHtml(d?: Destino): string {
  if (!d || !d.endereco) return "";
  const l = rvNavLinks(d);
  const a = (href: string, txt: string) => `<a href="${esc(href)}" target="_blank" rel="noopener">${txt}</a>`;
  return `<span class="nav" aria-label="Como chegar">${a(l.google, "Google Maps")}${a(l.waze, "Waze")}${a(l.uber, "Uber")}</span>`;
}

export function rvDeslocHtml(d?: Desloc): string {
  if (!d) return "";
  const ic = d.modo === "aviao" ? "✈️" : "🚗";
  const voo = d.modo === "aviao" && d.voo ? `<a class="voo" href="${esc(rvVooLink(d.voo))}" target="_blank" rel="noopener">Status do voo</a>` : "";
  return `<li class="desloc"><span></span><span></span><span class="dl"><i>${ic}</i>${esc(d.tempo ?? "tempo a definir")} · ${esc(d.trajeto)}${voo}</span></li>`;
}

// CSS dos botõezinhos e do cardzinho de deslocamento (também usado pela página do Antonio).
export const RV_NAV_CSS = `
.tl .c .nav{display:flex;justify-content:flex-end;flex-wrap:wrap;gap:5px;margin-top:7px}
.tl .c.tem-foto:has(>.nav){flex-wrap:wrap}
.tl .c.tem-foto>.nav{flex:0 0 100%;margin-top:0}
.tl .c .nav a{font-size:10.5px;font-weight:600;line-height:1;letter-spacing:.01em;color:#8f8893;text-decoration:none;padding:4px 7px;border-radius:999px;border:1px solid rgba(255,255,255,.09);background:rgba(255,255,255,.02);transition:color .2s,border-color .2s}
.tl .c .nav a:hover{color:#e9e4ea;border-color:rgba(255,255,255,.25)}
.tl li.desloc{margin:-3px 0}
.tl li.desloc .dl{margin-left:10px;justify-self:start;display:inline-flex;align-items:center;gap:6px;font-size:12px;font-weight:600;color:#8f8893;padding:3px 10px;border-radius:999px;border:1px dashed rgba(255,255,255,.13);background:var(--noite)}
.tl li.desloc .dl i{font-style:normal;font-size:12px}
.tl li.desloc .dl a.voo{margin-left:4px;font-size:10.5px;font-weight:600;line-height:1;color:#8f8893;text-decoration:none;padding:3px 7px;border-radius:999px;border:1px solid rgba(255,255,255,.09);transition:color .2s,border-color .2s}
.tl li.desloc .dl a.voo:hover{color:#e9e4ea;border-color:rgba(255,255,255,.25)}
@media (max-width:760px){.tl li.desloc .dl{margin-left:8px;font-size:11.5px;padding:3px 9px}.tl .c .nav a{font-size:10px;padding:4px 6px}}
`;
export type Foto = { src: string; alt: string };
export type Casa = { id: string; rotulo: string; nome: string; endereco: string; endSub: string; link?: string; fotos: Foto[]; resumo: string };
export type Mapa = {
  img: string; alt: string; rotulo: string; titulo: string; tituloSerif: string; texto: string; tempo: string; tempoSub: string;
  pinos: { x: number; y: number; nome: string }[];
};
export type OrdemDoDia = {
  expira: number;
  titulo: string; // <title> e og:title
  descricao: string;
  ogImg: string;
  hero: Foto & { pos?: string; w: number; h: number };
  kicker: string;
  nome: string; // nome em destaque no h1
  lead: string;
  quando: [string, string][];
  agendaNota: string;
  agenda: Passo[];
  casas: Casa[];
  mapa?: Mapa; // só com 2+ imóveis
  fechoTitulo: string;
  fechoTexto: string;
  rodape: string;
};

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function grade(c: Casa): string {
  if (!c.fotos.length) return "";
  const [g, ...p] = c.fotos;
  const abre = (cls: string) => (c.link ? `<a class="f ${cls}" href="${c.link}" target="_blank" rel="noopener">` : `<div class="f ${cls}">`);
  const fecha = c.link ? "</a>" : "</div>";
  return `<div class="grade g${c.fotos.length}">
      ${abre("f0")}<img src="${g.src}" alt="${esc(g.alt)}" loading="lazy" width="1280" height="853">${fecha}
      ${p.map((f, i) => `${abre(`f${i + 1}`)}<img src="${f.src}" alt="${esc(f.alt)}" loading="lazy" width="760" height="506">${fecha}`).join("\n      ")}
      ${c.link ? `<a class="todas" href="${c.link}" target="_blank" rel="noopener"><svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path fill="currentColor" d="M1 1h4v4H1zm5 0h4v4H6zm5 0h4v4h-4zM1 6h4v4H1zm5 0h4v4H6zm5 0h4v4h-4zM1 11h4v4H1zm5 0h4v4H6zm5 0h4v4h-4z"/></svg>Ver anúncio</a>` : ""}
    </div>`;
}

function casa(c: Casa, n: number): string {
  return `<section class="casa bloco" id="${c.id}">
    <div class="casa-topo">
      <div>
        <p class="rot"><span class="num">${n}</span>${esc(c.rotulo)}</p>
        <h2>${esc(c.nome)}</h2>
      </div>
      ${c.link ? `<a class="chip-link" href="${c.link}" target="_blank" rel="noopener">Airbnb ↗</a>` : ""}
    </div>
    ${grade(c)}
    <div class="casa-info">
      <div class="end"><i>📍</i><span><b>${esc(c.endereco)}</b>${esc(c.endSub)}</span></div>
      <p>${esc(c.resumo)}</p>
    </div>
  </section>`;
}

function mapa(m: Mapa): string {
  const [a, b] = m.pinos;
  const meio = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  const d = `M${a.x} ${a.y} C ${a.x + (b.x - a.x) * 0.4} ${a.y + (b.y - a.y) * 0.15}, ${b.x - (b.x - a.x) * 0.4} ${b.y - (b.y - a.y) * 0.15}, ${b.x} ${b.y}`;
  return `<section class="bloco" id="mapa">
    <div class="mapa-box">
      <div class="mapa-txt">
        <p class="rot">${esc(m.rotulo)}</p>
        <h2>${esc(m.titulo)} <span class="serif grad-txt">${esc(m.tituloSerif)}</span></h2>
        <p>${esc(m.texto)}</p>
        <div class="tempo"><b>${esc(m.tempo)}</b><span>${esc(m.tempoSub)}</span></div>
      </div>
      <div class="mapa">
        <img src="${m.img}" alt="${esc(m.alt)}" loading="lazy" width="1200" height="1200">
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          <path class="rota-sombra" vector-effect="non-scaling-stroke" d="${d}"/>
          <path class="rota" vector-effect="non-scaling-stroke" d="${d}"/>
        </svg>
        ${m.pinos.map((p, i) => `<div class="pino p${i + 1}" style="left:${p.x}%;top:${p.y + 1.6}%"><span class="et"><i>${i + 1}</i>${esc(p.nome)}</span><span class="pt"></span></div>`).join("\n        ")}
        <span class="min" style="left:${meio.x}%;top:${meio.y}%">🚗 ${esc(m.tempo)}</span>
        <span class="credito">© OpenStreetMap</span>
      </div>
    </div>
  </section>`;
}

export function rvOrdemHtml(o: OrdemDoDia): string {
  const casasHtml = o.casas.map((c, i) => casa(c, i + 1));
  const corpo = o.mapa && casasHtml.length >= 2 ? [casasHtml[0], mapa(o.mapa), ...casasHtml.slice(1)] : casasHtml;
  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(o.titulo)}</title>
<meta name="description" content="${esc(o.descricao)}">
<meta name="robots" content="noindex, nofollow">
<meta property="og:title" content="${esc(o.titulo)}">
<meta property="og:description" content="${esc(o.descricao)}">
<meta property="og:image" content="https://link.canaldoanfitriao.com.br${o.ogImg}">
<meta name="theme-color" content="#0e0d10">
<link rel="icon" href="/icon-192.png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Plus+Jakarta+Sans:ital,wght@0,400;0,500;0,600;0,700;0,800;1,800&display=swap" rel="stylesheet">
<link rel="preload" as="image" href="${o.hero.src}">
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
.hero picture,.hero picture img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;object-position:var(--hero-pos,50% 50%)}
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
.tl li.on .ic{background:var(--grad);border-color:transparent;box-shadow:0 10px 26px -10px rgba(230,30,77,.9)}
.tl li.on .c{background:linear-gradient(100deg,rgba(255,138,101,.16),rgba(189,30,89,.1));border-color:rgba(255,56,92,.4)}
.tl li.on .h{color:#ffb4a2}
.tl .c.tem-foto{display:flex;align-items:center;gap:12px}
.tl .c.tem-foto>div{flex:1;min-width:0}
.tl .c .mini{flex:none;width:72px;height:72px;border-radius:12px;object-fit:cover;border:1px solid rgba(255,255,255,.18);box-shadow:0 8px 20px -10px rgba(0,0,0,.8)}
.tl .c a.ver-rota{display:inline-block;margin-top:6px;font-size:13px;font-weight:700;color:#ffb4a2;text-decoration:none}
.tl .c a.mini-rota{flex:none;display:block;line-height:0}
.tl .c a.mini-rota .mini{width:96px;height:72px}
.obs{margin:14px 0 0 140px;font-size:13px;color:#8f8893}

${RV_NAV_CSS}
/* casas */
.casa-topo{display:flex;align-items:flex-end;justify-content:space-between;gap:16px;margin-bottom:18px}
.chip-link{flex:none;font-size:13px;font-weight:700;text-decoration:none;padding:9px 15px;border-radius:999px;background:#fff;color:var(--noite);transition:transform .2s}
.chip-link:hover{transform:translateY(-2px)}
.grade{position:relative;display:grid;grid-template-columns:2fr 1fr 1fr;grid-template-rows:1fr 1fr;gap:8px;height:clamp(300px,44vw,480px);border-radius:18px;overflow:hidden}
.grade .f{position:relative;overflow:hidden;background:#1d1a1f}
.grade .f0{grid-row:1/3}
.grade.g3{grid-template-columns:2fr 1fr}
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
  .tl .c .mini{width:64px;height:64px;border-radius:11px}
  .tl .c a.mini-rota .mini{width:84px;height:64px;border-radius:11px}
  .tl .c.tem-foto{gap:10px;padding-right:10px}
  .obs{margin-left:0}
  .grade{grid-template-columns:1fr 1fr;grid-template-rows:2fr 1fr 1fr;height:auto;aspect-ratio:3/4}
  .grade .f0{grid-row:auto;grid-column:1/3}
  .grade.g3{grid-template-rows:2fr 1fr;aspect-ratio:4/3}
  .casa-info{grid-template-columns:1fr}
  .mapa-box{grid-template-columns:1fr}
  .pino .et{font-size:11px;padding:5px 9px}
  .min{font-size:12px;padding:5px 10px}
  .rodape{justify-content:center;text-align:center}
}
</style>
</head>
<body>
<header class="hero" style="--hero-pos:${o.hero.pos ?? "50% 50%"}">
  <picture><img src="${o.hero.src}" alt="${esc(o.hero.alt)}" width="${o.hero.w}" height="${o.hero.h}" fetchpriority="high"></picture>
  <div class="topo">
    <div class="marca"><img src="/marca/cda-icone.png" alt="" width="34" height="34">Canal do Anfitrião</div>
    <span class="pill">Ordem do dia</span>
  </div>
  <div class="wrap">
    <p class="kicker rv" style="--d:.04s">${esc(o.kicker)}</p>
    <h1 class="rv" style="--d:.08s">Rômulo Visita <span class="serif grad-txt">${esc(o.nome)}</span></h1>
    <p class="lead rv" style="--d:.14s">${esc(o.lead)}</p>
    <div class="quando rv" style="--d:.2s">
      ${o.quando.map(([k, v]) => `<div><small>${esc(k)}</small><b>${esc(v)}</b></div>`).join("\n      ")}
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
      <p>${esc(o.agendaNota)}</p>
    </div>
    <ol class="tl">
      ${o.agenda.map((a) => `${rvDeslocHtml(a.desloc)}<li${a.destaque ? ' class="on"' : ""}><span class="h">${esc(a.hora)}</span><span class="ic">${a.icone}</span>${a.rota ? `<div class="c tem-foto"><div><b>${esc(a.titulo)}</b><span>${esc(a.texto)}</span><a class="ver-rota" href="${esc(a.rota.href)}" target="_blank" rel="noopener">Ver rota no mapa ↗</a></div><a class="mini-rota" href="${esc(a.rota.href)}" target="_blank" rel="noopener" aria-label="Abrir rota no Google Maps"><img class="mini" src="${a.rota.src}" alt="${esc(a.rota.alt)}" loading="lazy" width="96" height="72"></a>${rvNavHtml(a.destino)}</div>` : a.foto ? `<div class="c tem-foto"><div><b>${esc(a.titulo)}</b><span>${esc(a.texto)}</span></div><img class="mini" src="${a.foto.src}" alt="${esc(a.foto.alt)}" loading="lazy" width="72" height="72">${rvNavHtml(a.destino)}</div>` : `<div class="c"><b>${esc(a.titulo)}</b><span>${esc(a.texto)}</span>${rvNavHtml(a.destino)}</div>`}</li>`).join("\n      ")}
    </ol>
  </section>

  ${corpo.join("\n\n  ")}

  <section class="fecho">
    <div>
      <h3>${esc(o.fechoTitulo.split("|")[0])}<span class="serif grad-txt">${esc(o.fechoTitulo.split("|")[1] ?? "")}</span></h3>
      <p>${esc(o.fechoTexto)}</p>
    </div>
  </section>

  <footer class="rodape">
    <span>${esc(o.rodape)}</span>
    <span>Canal do Anfitrião</span>
  </footer>
</main>
</body>
</html>
`;
}

export function rvOrdemResposta(o: OrdemDoDia): Response {
  if (Date.now() >= o.expira) {
    return new Response(null, { status: 307, headers: { Location: RV_DEPOIS, "Cache-Control": "no-store" } });
  }
  return new Response(rvOrdemHtml(o), {
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "public, max-age=0, s-maxage=300" },
  });
}
