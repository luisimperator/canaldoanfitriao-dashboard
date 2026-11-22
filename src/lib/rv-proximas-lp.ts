// Rômulo Visita: índice das próximas gravações
// link.canaldoanfitriao.com.br/internos/rv-proximas (mesmo visual das ordens do dia,
// template em src/lib/rv-ordem-lp.ts). Um card por gravação marcada, em ordem
// cronológica, levando pra Ordem do dia do convidado (/internos/rv-<nome>).
// Gravação que já passou some sozinha: o card sai da lista à meia-noite
// (Brasília) do dia seguinte à gravação. Gravação nova = uma linha em GRAVACOES.

export type Gravacao = {
  slug: string; // rota /internos/<slug>
  data: string; // AAAA-MM-DD (dia da gravação, horário de Brasília)
  hora: string; // horário da gravação
  nome: string;
  cidade: string;
  local: string;
  foto: string;
  fotoAlt: string;
};

export const GRAVACOES: Gravacao[] = [
  { slug: "rv-taisa", data: "2026-11-23", hora: "14h00", nome: "Taisa Sanitá", cidade: "Campos do Jordão · SP", local: "Hotel Home Green Home", foto: "/lp/rv-taisa/topo.webp", fotoAlt: "Hotel Home Green Home no meio da mata, em Campos do Jordão" },
  { slug: "rv-priscila", data: "2026-12-02", hora: "13h30", nome: "Priscila Araujo", cidade: "Rio de Janeiro · RJ", local: "Vidigal · 3 casas", foto: "/lp/rv-priscila/topo.webp", fotoAlt: "Terraço com hidro e vista para o mar, no Vidigal" },
  { slug: "rv-tiago", data: "2026-12-07", hora: "13h00", nome: "Tiago Bueno Diniz", cidade: "Local a definir", local: "Host Gestão", foto: "/lp/rv-tiago/topo.webp", fotoAlt: "Escritório da Host Gestão" },
  { slug: "rv-pedro", data: "2026-12-09", hora: "14h00", nome: "Pedro Siqueira", cidade: "Poços de Caldas · MG", local: "Intelecto Stays", foto: "/lp/rv-pedro/topo.webp", fotoAlt: "Sala integrada do apartamento da Intelecto" },
];

const DIAS = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// fim do dia da gravação = 00h (Brasília) do dia seguinte
const fimDoDia = (data: string) => Date.parse(`${data}T00:00:00-03:00`) + 24 * 3600 * 1000;

export function proximasGravacoes(agora = Date.now()): Gravacao[] {
  return GRAVACOES.filter((g) => agora < fimDoDia(g.data)).sort((a, b) => a.data.localeCompare(b.data));
}

function partes(data: string) {
  const d = new Date(`${data}T12:00:00-03:00`);
  return { dia: data.slice(8, 10), mes: MESES[Number(data.slice(5, 7)) - 1], semana: DIAS[d.getUTCDay()], curta: `${data.slice(8, 10)}/${data.slice(5, 7)}` };
}

function hojeEm(agora: number): string {
  return new Date(agora - 3 * 3600 * 1000).toISOString().slice(0, 10);
}

function card(g: Gravacao, i: number, hoje: string): string {
  const p = partes(g.data);
  const selo = g.data === hoje ? "Hoje" : i === 0 ? "Próxima" : "";
  return `<a class="card rv" style="--d:${(0.06 * i + 0.1).toFixed(2)}s" href="/internos/${g.slug}">
      <div class="foto">
        <img src="${g.foto}" alt="${esc(g.fotoAlt)}" loading="${i < 2 ? "eager" : "lazy"}" width="1440" height="960">
        <div class="data"><b>${p.dia}</b><span>${p.mes}</span></div>
        ${selo ? `<span class="selo">${selo}</span>` : ""}
      </div>
      <div class="info">
        <p class="rot">${esc(p.semana)}, ${p.curta}</p>
        <h2>${esc(g.nome)}</h2>
        <p class="onde"><i>📍</i>${esc(g.cidade)}<span>${esc(g.local)}</span></p>
        <div class="pe">
          <span class="hora"><i>🎬</i>Gravação às <b>${esc(g.hora)}</b></span>
          <span class="ver">Ordem do dia <span aria-hidden="true">→</span></span>
        </div>
      </div>
    </a>`;
}

export function rvProximasHtml(agora = Date.now()): string {
  const lista = proximasGravacoes(agora);
  const hoje = hojeEm(agora);
  const cards = lista.map((g, i) => card(g, i, hoje)).join("\n    ");
  const vazio = `<div class="vazio"><h3>Nenhuma gravação marcada <span class="serif grad-txt">por enquanto</span></h3><p>Quando a próxima for confirmada, ela aparece aqui.</p></div>`;
  const qtd = lista.length === 1 ? "1 gravação marcada" : `${lista.length} gravações marcadas`;
  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>Rômulo Visita · Próximas gravações</title>
<meta name="description" content="As próximas gravações do Rômulo Visita, com a ordem do dia de cada uma.">
<meta name="robots" content="noindex, nofollow">
<meta property="og:title" content="Rômulo Visita · Próximas gravações">
<meta property="og:description" content="As próximas gravações do Rômulo Visita, com a ordem do dia de cada uma.">
${lista[0] ? `<meta property="og:image" content="https://link.canaldoanfitriao.com.br${lista[0].foto}">` : ""}
<meta name="theme-color" content="#0e0d10">
<link rel="icon" href="/icon-192.png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Plus+Jakarta+Sans:ital,wght@0,400;0,500;0,600;0,700;0,800;1,800&display=swap" rel="stylesheet">
<style>
:root{
  --coral:#ff385c;--rosa:#e61e4d;--vinho:#bd1e59;--pessego:#ff8a65;
  --noite:#0e0d10;--noite2:#17151a;--linha:rgba(255,255,255,.1);--cinza:#b9b3bd;
  --grad:linear-gradient(100deg,var(--pessego),var(--coral) 45%,var(--rosa) 75%,var(--vinho));
}
*{box-sizing:border-box}
html{-webkit-text-size-adjust:100%}
body{margin:0;background:var(--noite);color:#fff;font:16px/1.55 "Plus Jakarta Sans",system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;-webkit-font-smoothing:antialiased;overflow-x:hidden;
  background-image:radial-gradient(60% 40% at 0% 0%,rgba(230,30,77,.22),transparent 70%),radial-gradient(50% 30% at 100% 0%,rgba(255,138,101,.12),transparent 70%);background-repeat:no-repeat}
img{display:block;max-width:100%}
a{color:inherit;text-decoration:none}
.serif{font-family:"Instrument Serif",Georgia,serif;font-style:italic;font-weight:400}
.grad-txt{background:var(--grad);-webkit-background-clip:text;background-clip:text;color:transparent}
.wrap{width:min(1120px,100%);margin:0 auto;padding:0 clamp(20px,4vw,40px)}
.rot{display:flex;align-items:center;gap:10px;margin:0 0 6px;font-size:11px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:var(--coral)}
.topo{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:22px 0}
.marca{display:flex;align-items:center;gap:10px;font-size:12px;font-weight:700;letter-spacing:.14em;text-transform:uppercase}
.marca img{width:34px;height:34px;border-radius:9px}
.pill{display:inline-flex;align-items:center;gap:8px;font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;padding:8px 14px;border-radius:999px;border:1px solid rgba(255,56,92,.45);background:rgba(14,13,16,.55);white-space:nowrap}
.pill:before{content:"";width:8px;height:8px;border-radius:50%;background:var(--coral);box-shadow:0 0 0 0 rgba(255,56,92,.7);animation:pulso 1.8s infinite}
@keyframes pulso{70%{box-shadow:0 0 0 10px rgba(255,56,92,0)}100%{box-shadow:0 0 0 0 rgba(255,56,92,0)}}
.cab{padding:clamp(26px,6vh,64px) 0 clamp(26px,4vh,40px)}
.kicker{margin:0 0 10px;font-size:13px;font-weight:700;letter-spacing:.16em;text-transform:uppercase;color:#ffd9cf}
h1{margin:0;font-weight:800;font-size:clamp(40px,6.2vw,80px);line-height:.98;letter-spacing:-.04em}
h1 .serif{font-size:1.1em;letter-spacing:-.01em}
.lead{margin:16px 0 0;font-size:clamp(16px,1.3vw,19px);color:#e9e4ea;max-width:620px}
.grade{display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:18px}
.card{display:flex;flex-direction:column;border-radius:22px;overflow:hidden;background:var(--noite2);border:1px solid var(--linha);transition:transform .25s cubic-bezier(.2,.8,.2,1),border-color .25s,box-shadow .25s}
.card:hover{transform:translateY(-4px);border-color:rgba(255,56,92,.45);box-shadow:0 24px 50px -24px rgba(230,30,77,.55)}
.foto{position:relative;aspect-ratio:16/10;overflow:hidden;background:#1d1a1f}
.foto img{width:100%;height:100%;object-fit:cover;transition:transform .5s cubic-bezier(.2,.8,.2,1)}
.card:hover .foto img{transform:scale(1.04)}
.foto:after{content:"";position:absolute;inset:0;background:linear-gradient(0deg,rgba(14,13,16,.55),transparent 45%)}
.data{position:absolute;z-index:1;left:14px;top:14px;display:grid;place-items:center;min-width:62px;padding:8px 10px 7px;border-radius:16px;background:rgba(14,13,16,.78);backdrop-filter:blur(8px);border:1px solid rgba(255,255,255,.16);line-height:1}
.data b{font-size:28px;font-weight:800;letter-spacing:-.03em}
.data span{margin-top:4px;font-size:11px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:#ffb4a2}
.selo{position:absolute;z-index:1;right:14px;top:14px;font-size:11px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;padding:7px 12px;border-radius:999px;background:var(--grad);box-shadow:0 10px 26px -10px rgba(230,30,77,.9)}
.info{display:flex;flex-direction:column;flex:1;padding:18px 20px 20px}
h2{margin:0;font-weight:800;font-size:clamp(22px,2.2vw,28px);line-height:1.1;letter-spacing:-.03em}
.onde{display:flex;flex-wrap:wrap;align-items:center;gap:4px 8px;margin:10px 0 0;font-size:15px;font-weight:600}
.onde i{font-style:normal}
.onde span{flex-basis:100%;padding-left:26px;font-size:13.5px;font-weight:500;color:var(--cinza)}
.pe{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-top:auto;padding-top:18px}
.hora{display:inline-flex;align-items:center;gap:8px;font-size:14px;color:#e9e4ea;padding:9px 13px;border-radius:12px;background:linear-gradient(100deg,rgba(255,138,101,.16),rgba(189,30,89,.1));border:1px solid rgba(255,56,92,.35)}
.hora i{font-style:normal}
.hora b{font-size:15px}
.ver{font-size:13.5px;font-weight:700;padding:9px 15px;border-radius:999px;background:#fff;color:var(--noite)}
.vazio{padding:clamp(28px,4vw,44px);border-radius:24px;background:var(--noite2);border:1px solid var(--linha)}
.vazio h3{margin:0;font-size:clamp(24px,2.6vw,32px);font-weight:800;letter-spacing:-.03em}
.vazio p{margin:8px 0 0;color:var(--cinza)}
.rodape{display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-top:48px;padding:18px 0 30px;font-size:12.5px;color:#8f8893;border-top:1px solid var(--linha)}
.rv{opacity:0;transform:translateY(14px);animation:sobe .7s cubic-bezier(.2,.8,.2,1) forwards;animation-delay:var(--d,0s)}
@keyframes sobe{to{opacity:1;transform:none}}
@media (prefers-reduced-motion:reduce){.rv{opacity:1;transform:none;animation:none}.pill:before{animation:none}}
@media (max-width:760px){
  .topo{padding:16px 0}
  .marca{font-size:11px}
  .marca img{width:30px;height:30px}
  .pill{font-size:11px;padding:7px 11px}
  .grade{grid-template-columns:1fr;gap:14px}
  .info{padding:16px 16px 18px}
  .rodape{justify-content:center;text-align:center}
}
</style>
</head>
<body>
<div class="wrap">
  <div class="topo">
    <div class="marca"><img src="/marca/cda-icone.png" alt="" width="34" height="34">Canal do Anfitrião</div>
    <span class="pill">Agenda</span>
  </div>
  <header class="cab">
    <p class="kicker rv" style="--d:.02s">${qtd}</p>
    <h1 class="rv" style="--d:.06s">Rômulo Visita <span class="serif grad-txt">Próximas gravações</span></h1>
    <p class="lead rv" style="--d:.1s">Em ordem de data. Toque no card pra abrir a ordem do dia completa de cada gravação.</p>
  </header>
  <main class="grade">
    ${cards || vazio}
  </main>
  <footer class="rodape">
    <span>Rômulo Visita · Próximas gravações</span>
    <span>Canal do Anfitrião</span>
  </footer>
</div>
</body>
</html>
`;
}

export function rvProximasResposta(): Response {
  return new Response(rvProximasHtml(), {
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "public, max-age=0, s-maxage=300" },
  });
}
