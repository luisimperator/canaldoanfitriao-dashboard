// Página pública curta dos links fixos da Imersão (/imersao e /vip) quando não
// há pra onde redirecionar: sala ainda fechada, intervalo entre os dias, grupo
// sem link. Atualiza sozinha a cada minuto — quem chegou cedo cai na sala assim
// que ela abre, sem precisar clicar de novo.

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export function paginaAviso(titulo: string, linhas: string[], opts: { recarregar?: boolean } = {}): Response {
  const html = `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
${opts.recarregar === false ? "" : '<meta http-equiv="refresh" content="60">'}
<meta name="robots" content="noindex">
<title>${esc(titulo)} · Imersão A5E</title>
<style>
  :root { --bg:#f6f5f2; --card:#fff; --ink:#18181b; --ink2:#52525b; --line:#e4e4e7; --acc:#e11d48; }
  @media (prefers-color-scheme: dark) { :root { --bg:#0b0b0d; --card:#151518; --ink:#f4f4f5; --ink2:#a1a1aa; --line:#27272a; --acc:#fb7185; } }
  * { box-sizing:border-box; }
  body { margin:0; min-height:100vh; display:grid; place-items:center; padding:16px;
         background:var(--bg); color:var(--ink); font:16px/1.55 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif; }
  main { width:100%; max-width:460px; background:var(--card); border:1px solid var(--line); border-radius:22px; padding:28px 24px; }
  .eyebrow { font:600 11px/1 ui-monospace,monospace; letter-spacing:.2em; text-transform:uppercase; color:var(--acc); margin-bottom:12px; }
  h1 { margin:0 0 12px; font-size:24px; line-height:1.2; letter-spacing:-.01em; }
  p { margin:8px 0 0; color:var(--ink2); }
</style>
</head>
<body>
<main>
  <div class="eyebrow">Imersão A5E</div>
  <h1>${esc(titulo)}</h1>
  ${linhas.map((l) => `<p>${esc(l)}</p>`).join("\n  ")}
</main>
</body>
</html>`;
  return new Response(html, {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
  });
}

// Página de espera do /imersao (antes do sábado e no intervalo entre os dias),
// com a cara da LP onde a pessoa se inscreveu, mais enxuta (Fernando, 20/11:
// "coloca um countdown (...) põe a carinha do Rômulo (...) mais parecido com o
// que a pessoa se inscreveu"). Contagem até o início; quando a sala abre (30 min
// antes), a página recarrega e o /imersao redireciona pra sala. O relógio é o
// do servidor (agoraMs), pra não depender do relógio do celular.
export function paginaEspera(o: {
  titulo: string;
  frase: string;
  /** Faixa bem grande acima do título (Fernando, 21/11: "Coloca bem grande: COMEÇAMOS ÀS 10:00"). */
  destaque?: string;
  quando: string;
  abreTexto: string;
  inicioMs: number;
  abreMs: number;
  agoraMs: number;
}): Response {
  const A = "/lp/imersao";
  const html = `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta http-equiv="refresh" content="300">
<meta name="robots" content="noindex">
<meta name="theme-color" content="#fffaf7">
<title>${esc(o.titulo)} · Imersão Chuva de Reservas</title>
<link rel="icon" href="/icon-192.png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Plus+Jakarta+Sans:wght@400;600;700;800&display=swap" rel="stylesheet">
<style>
:root{--coral:#ff385c;--rosa:#e61e4d;--vinho:#bd1e59;--pessego:#ff8a65;--papel:#fffaf7;--tinta:#141216;--tinta2:#5b5660;--linha:#f1dcd8;
  --grad:linear-gradient(100deg,var(--pessego),var(--coral) 45%,var(--rosa) 75%,var(--vinho))}
*{box-sizing:border-box}
html,body{margin:0;min-height:100%}
body{min-height:100vh;display:grid;place-items:center;padding:24px 16px;background:var(--papel);color:var(--tinta);
  font:16px/1.55 "Plus Jakarta Sans",system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;-webkit-font-smoothing:antialiased;overflow-x:hidden;position:relative}
.aurora{position:fixed;inset:0;z-index:-1;filter:blur(60px);opacity:.7;pointer-events:none;overflow:hidden}
.aurora i{position:absolute;border-radius:50%;mix-blend-mode:multiply;animation:flutua 18s ease-in-out infinite alternate}
.aurora i:nth-child(1){width:70vw;height:70vw;left:40%;top:-20%;background:#ffc3cf}
.aurora i:nth-child(2){width:60vw;height:60vw;left:-25%;top:50%;background:#ffd8c2;animation-duration:22s}
@keyframes flutua{to{transform:translate3d(-6%,8%,0) scale(1.12)}}
main{width:100%;max-width:440px;text-align:center}
.logo{width:116px;margin:0 auto 22px;display:block}
.foto{width:112px;height:112px;margin:0 auto;border-radius:50%;padding:3px;background:var(--grad);box-shadow:0 18px 40px -18px rgba(189,30,89,.55)}
.foto i{display:block;width:100%;height:100%;border-radius:50%;border:3px solid var(--papel);background:#000 url(${A}/romulo.webp) 50% 24%/185% auto no-repeat}
.quem{margin:10px 0 0;font-size:13px;color:var(--tinta2)}
.quem b{color:var(--tinta)}
.destaque{margin:20px auto 4px;font-size:clamp(34px,10.5vw,54px);font-weight:800;line-height:1.1;letter-spacing:-.035em;text-transform:uppercase;
  background:var(--grad);-webkit-background-clip:text;background-clip:text;color:transparent}
.ok{display:inline-flex;align-items:center;gap:8px;margin:22px 0 10px;background:#fff;border:1px solid var(--linha);border-radius:999px;padding:6px 14px;font-size:13px;font-weight:700;color:#15803d}
h1{margin:0;font-size:clamp(26px,7vw,34px);font-weight:800;letter-spacing:-.03em;line-height:1.1}
h1 .serif{font-family:"Instrument Serif",Georgia,serif;font-style:italic;font-weight:400;letter-spacing:-.01em;background:var(--grad);-webkit-background-clip:text;background-clip:text;color:transparent}
.cd{display:flex;justify-content:center;gap:8px;margin:22px 0 8px;font-variant-numeric:tabular-nums}
.cd div{min-width:70px;background:#fff;border:1px solid var(--linha);border-radius:18px;padding:12px 6px 10px;box-shadow:0 14px 30px -22px rgba(20,10,20,.35)}
.cd b{display:block;font-size:30px;font-weight:800;line-height:1;letter-spacing:-.02em}
.cd small{display:block;margin-top:6px;font-size:10px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:var(--tinta2)}
.cd .d[hidden]{display:none}
.quando{margin:14px 0 0;font-weight:700}
.abre{margin:4px 0 0;color:var(--tinta2);font-size:15px}
.nota{margin:24px auto 0;max-width:360px;font-size:13px;color:var(--tinta2)}
@media (prefers-reduced-motion:reduce){.aurora i{animation:none}}
</style>
</head>
<body>
<div class="aurora" aria-hidden="true"><i></i><i></i></div>
<main>
  <img class="logo" src="${A}/logo.svg" alt="Canal do Anfitrião">
  <div class="foto" role="img" aria-label="Rômulo Villela"><i></i></div>
  <p class="quem">com <b>Rômulo Villela</b></p>
  ${o.destaque ? `<p class="destaque">${esc(o.destaque)}</p>` : ""}
  <div class="ok">✅ Seu link está certo</div>
  <h1>${esc(o.titulo)}<br><span class="serif">${esc(o.frase)}</span></h1>
  <div class="cd" id="cd" aria-live="polite">
    <div class="d" id="cd-d"><b id="d">0</b><small>dias</small></div>
    <div><b id="h">00</b><small>horas</small></div>
    <div><b id="m">00</b><small>min</small></div>
    <div><b id="s">00</b><small>seg</small></div>
  </div>
  <p class="quando">${esc(o.quando)}</p>
  <p class="abre">${esc(o.abreTexto)}</p>
  <p class="nota">Guarde este link: é por ele que você entra na sala. Quando a sala abrir, esta página te leva direto pra lá.</p>
</main>
<script>
(function(){
  var inicio=${o.inicioMs}, abre=${o.abreMs}, desvio=${o.agoraMs}-Date.now();
  var el=function(id){return document.getElementById(id)};
  var dois=function(n){return n<10?"0"+n:""+n};
  var recarregou=false;
  function tique(){
    var agora=Date.now()+desvio;
    if(agora>=abre&&!recarregou){recarregou=true;location.reload();return}
    var r=Math.max(0,Math.floor((inicio-agora)/1000));
    var d=Math.floor(r/86400), h=Math.floor(r%86400/3600), m=Math.floor(r%3600/60), s=r%60;
    el("cd-d").hidden=d===0; el("d").textContent=d;
    el("h").textContent=dois(h); el("m").textContent=dois(m); el("s").textContent=dois(s);
  }
  tique(); setInterval(tique,1000);
})();
</script>
</body>
</html>`;
  return new Response(html, {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
  });
}

/** "sábado, 21/11" no horário de São Paulo. */
export function diaHumano(iso: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    weekday: "long",
    day: "2-digit",
    month: "2-digit",
  }).format(new Date(iso));
}

/** "8h30" no horário de São Paulo. */
export function horaHumana(iso: string | number): string {
  const p = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(iso));
  const h = String(Number(p.find((x) => x.type === "hour")?.value ?? 0));
  const m = p.find((x) => x.type === "minute")?.value ?? "00";
  return m === "00" ? `${h}h` : `${h}h${m}`;
}
