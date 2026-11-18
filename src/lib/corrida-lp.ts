// LP da corrida "Corre Anfitrião" (12/12/2026, Campus da USP, parceria E-Corpus):
// link.canaldoanfitriao.com.br/corrida-anfitriao (/corrida redireciona pra cá).
// Página estática; imagens em public/lp/corrida/.

// Link do botão "Comprar agora": ÚNICO lugar pra trocar. O produto na Eduzz
// ainda não existe (falta o preço); enquanto isso o botão aponta pra "#".
// Dá pra trocar sem deploy de código definindo CORRIDA_CHECKOUT_URL na Vercel.
export const CORRIDA_CHECKOUT_PADRAO = "#";

export function corridaCheckout(): string {
  return process.env.CORRIDA_CHECKOUT_URL?.trim() || CORRIDA_CHECKOUT_PADRAO;
}

function attr(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

export function corridaHtml(checkout: string): string {
  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>Corre Anfitrião · 12/12/2026 · Canal do Anfitrião</title>
<meta name="description" content="Bora correr 5 km para fechar o ano de 2026, tomar um café da manhã juntos e ajudar pessoas em situação de rua. Ingresso: R$ 147,00 + 1 kg de alimento não perecível, que será doado para o programa Chá do Padre da Paróquia São Francisco de Assis. 12/12, 7h, Campus da USP.">
<meta property="og:title" content="Corre Anfitrião · 12/12/2026">
<meta property="og:description" content="5 km pra fechar 2026 e café da manhã juntos. Ingresso: R$ 147,00 + 1 kg de alimento não perecível, doado para o programa Chá do Padre da Paróquia São Francisco de Assis. Campus da USP, 7h. 100 vagas.">
<meta property="og:image" content="https://link.canaldoanfitriao.com.br/lp/corrida/og.jpg">
<meta name="theme-color" content="#0e0d10">
<link rel="icon" href="/icon-192.png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Plus+Jakarta+Sans:ital,wght@0,400;0,500;0,600;0,700;0,800;1,800&display=swap" rel="stylesheet">
<link rel="preload" as="image" href="/lp/corrida/foto.webp" media="(min-width:961px)">
<link rel="preload" as="image" href="/lp/corrida/foto-celular.webp" media="(max-width:960px)">
<style>
:root{
  --coral:#ff385c;--rosa:#e61e4d;--vinho:#bd1e59;--pessego:#ff8a65;
  --noite:#0e0d10;--noite2:#17151a;--linha:rgba(255,255,255,.1);--cinza:#b9b3bd;
  --grad:linear-gradient(100deg,var(--pessego),var(--coral) 45%,var(--rosa) 75%,var(--vinho));
}
*{box-sizing:border-box}
html{-webkit-text-size-adjust:100%}
body{margin:0;background:var(--noite);color:#fff;font:16px/1.55 "Plus Jakarta Sans",system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;-webkit-font-smoothing:antialiased;overflow-x:hidden}
img{display:block;max-width:100%}
a{color:inherit}
.serif{font-family:"Instrument Serif",Georgia,serif;font-style:italic;font-weight:400}
.grad-txt{background:var(--grad);-webkit-background-clip:text;background-clip:text;color:transparent}

.dobra{display:grid;grid-template-columns:minmax(0,1.02fr) minmax(0,.98fr);grid-template-rows:minmax(100vh,auto) auto;grid-template-rows:minmax(100svh,auto) auto}

/* coluna da esquerda */
.info{position:relative;display:flex;flex-direction:column;justify-content:center;gap:clamp(10px,1.7vh,18px);padding:clamp(22px,3.2vh,40px) clamp(28px,4.6vw,72px)}
.info:before{content:"";position:absolute;inset:0;z-index:-1;background:radial-gradient(70% 50% at 0% 0%,rgba(230,30,77,.22),transparent 70%),radial-gradient(60% 45% at 100% 100%,rgba(255,138,101,.12),transparent 70%)}
.topo{display:flex;align-items:center;justify-content:space-between;gap:16px}
.marca{display:flex;align-items:center;gap:10px;font-size:12px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:var(--cinza)}
.marca img{width:34px;height:34px;border-radius:9px}
.logo-corre{width:min(280px,100%);height:auto;display:block}
.vagas-topo{display:inline-flex;align-items:center;gap:8px;font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;padding:8px 14px;border-radius:999px;border:1px solid rgba(255,56,92,.45);background:rgba(255,56,92,.1);white-space:nowrap}
.vagas-topo:before{content:"";width:8px;height:8px;border-radius:50%;background:var(--coral);box-shadow:0 0 0 0 rgba(255,56,92,.7);animation:pulso 1.8s infinite}
@keyframes pulso{70%{box-shadow:0 0 0 10px rgba(255,56,92,0)}100%{box-shadow:0 0 0 0 rgba(255,56,92,0)}}

h1{margin:0;font-weight:800;font-size:clamp(30px,3.1vw,48px);line-height:1.04;letter-spacing:-.035em}
h1 .serif{font-size:1.12em;letter-spacing:-.01em}
.lead{margin:0;font-size:clamp(15px,1.1vw,17px);color:#d9d4dc;max-width:580px}

.quando{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;max-width:600px}
.quando div{background:var(--noite2);border:1px solid var(--linha);border-radius:16px;padding:9px 14px}
.quando small{display:block;font-size:10.5px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:var(--coral)}
.quando b{display:block;font-size:clamp(17px,1.45vw,21px);font-weight:800;letter-spacing:-.02em;line-height:1.25}

.inclui{display:flex;flex-wrap:wrap;gap:8px;margin:0;padding:0;list-style:none;max-width:640px}
.inclui li{display:inline-flex;align-items:center;gap:8px;font-size:13.5px;font-weight:600;padding:7px 12px 7px 8px;border-radius:999px;background:rgba(255,255,255,.06);border:1px solid var(--linha)}
.inclui li span{display:grid;place-items:center;width:22px;height:22px;border-radius:50%;background:var(--grad);font-size:12px}
.rot{font-size:11px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:var(--cinza);margin:0 0 -4px}

.doa{display:flex;gap:12px;align-items:center;max-width:600px;font-size:13.5px;color:#e9e4ea;padding:11px 14px;border-radius:14px;background:linear-gradient(90deg,rgba(255,138,101,.14),rgba(189,30,89,.08));border:1px solid rgba(255,138,101,.28)}
.doa b{color:#fff}
.doa i{font-style:normal;font-size:22px;line-height:1}
.doa small{display:block;margin-top:3px;font-size:12px;color:var(--cinza)}
.doa small a{color:var(--pessego);font-weight:700;text-decoration:none}
.doa small a:hover{text-decoration:underline}
.doa .sefras{flex:none;margin-left:auto;display:grid;place-items:center;background:#fff;border-radius:10px;padding:5px 8px;opacity:.92;transition:opacity .2s}
.doa .sefras:hover{opacity:1}
.doa .sefras img{display:block;height:20px;width:auto}

.acao{display:flex;align-items:center;gap:18px;flex-wrap:wrap}
.btn{position:relative;isolation:isolate;overflow:hidden;display:inline-flex;align-items:center;gap:14px;background:var(--grad);background-size:160% 100%;color:#fff;font-weight:800;font-size:18px;text-decoration:none;padding:17px 34px;border-radius:999px;box-shadow:0 18px 40px -16px rgba(230,30,77,.85),inset 0 1px 0 rgba(255,255,255,.25);transition:transform .25s cubic-bezier(.2,.8,.2,1),box-shadow .25s,background-position .6s;white-space:nowrap}
.btn:hover{transform:translateY(-3px) scale(1.02);background-position:100% 0;box-shadow:0 26px 50px -18px rgba(230,30,77,.95)}
.btn i{font-style:normal;font-size:20px;transition:transform .25s}
.btn:hover i{transform:translateX(4px)}
.btn:after{content:"";position:absolute;inset:0;z-index:-1;background:linear-gradient(105deg,transparent 35%,rgba(255,255,255,.45) 50%,transparent 65%);transform:translateX(-120%);animation:brilho 3.6s ease-in-out infinite}
@keyframes brilho{0%,55%{transform:translateX(-120%)}100%{transform:translateX(120%)}}
.vagas{font-size:14px;color:var(--cinza);line-height:1.35}
.vagas b{display:block;color:#fff;font-size:16px}
.preco{font-size:13px;color:var(--cinza);line-height:1.2;white-space:nowrap}
.preco b{display:block;color:#fff;font-size:26px;font-weight:800;letter-spacing:-.02em}

.local{display:grid;grid-template-columns:minmax(0,.9fr) minmax(0,1.1fr);gap:0;max-width:600px;border-radius:16px;overflow:hidden;border:1px solid var(--linha);background:var(--noite2)}
.local .end{padding:12px 16px;font-size:14px;color:#d9d4dc;display:flex;flex-direction:column;justify-content:center;gap:2px}
.local .end small{font-size:10.5px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:var(--coral)}
.local .end b{color:#fff;font-size:15px}
.local .end a{font-size:13px;font-weight:700;color:var(--pessego);text-decoration:none;margin-top:4px}
.local iframe{width:100%;height:100%;min-height:104px;border:0;display:block;filter:grayscale(.25) contrast(1.05)}

/* coluna da direita: foto */
.foto{position:relative;overflow:hidden;background:#1d1a1f}
.foto picture,.foto picture img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;object-position:50% 30%}
.foto:after{content:"";position:absolute;inset:0;background:linear-gradient(90deg,var(--noite) 0,rgba(14,13,16,0) 18%),linear-gradient(0deg,rgba(14,13,16,.85) 0,rgba(14,13,16,0) 38%);pointer-events:none}
.selo-giro{position:absolute;z-index:2;top:28px;right:28px;width:128px;height:128px;filter:drop-shadow(0 10px 24px rgba(0,0,0,.45))}
.selo-giro .anel{transform-origin:50% 50%;animation:gira 22s linear infinite}
@keyframes gira{to{transform:rotate(360deg)}}
.parceria{position:absolute;z-index:2;left:clamp(24px,3vw,44px);right:clamp(24px,3vw,44px);bottom:clamp(24px,3.4vh,40px);display:flex;align-items:center;gap:18px;width:max-content;max-width:calc(100% - 48px);background:#fff;color:var(--noite);border-radius:20px;padding:12px 20px 12px 14px;box-shadow:0 24px 50px -20px rgba(0,0,0,.6)}
.parceria img{height:62px;width:auto}
.parceria p{margin:0;font-size:12px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#6a6470;line-height:1.35}
.parceria p b{display:block;font-size:17px;letter-spacing:-.01em;text-transform:none;color:var(--noite)}
.parceria .div{width:1px;align-self:stretch;background:#eee}
.legenda{position:absolute;z-index:2;right:clamp(24px,3vw,44px);bottom:clamp(30px,3.8vh,46px);text-align:right;font-size:13px;color:rgba(255,255,255,.82);line-height:1.3}
.legenda b{display:block;color:#fff;font-size:14px}

.rodape{grid-column:1/-1;display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;padding:18px clamp(28px,4.6vw,72px);font-size:12.5px;color:#8f8893;border-top:1px solid var(--linha)}

/* entrada suave */
.rv{opacity:0;transform:translateY(14px);animation:sobe .7s cubic-bezier(.2,.8,.2,1) forwards;animation-delay:var(--d,0s)}
@keyframes sobe{to{opacity:1;transform:none}}
@media (prefers-reduced-motion:reduce){.rv{opacity:1;transform:none;animation:none}.btn:after,.selo-giro .anel,.vagas-topo:before{animation:none}}

/* telas baixas no desktop: aperta pra caber numa dobra */
@media (min-width:961px) and (max-height:860px){
  .info{gap:9px;padding-top:18px;padding-bottom:18px}
  .logo-corre{width:240px}
  h1{font-size:clamp(28px,2.8vw,42px)}
  .lead{font-size:14.5px;line-height:1.5}
  .quando b{font-size:18px}
  .local iframe{min-height:92px}
  .local .end{padding:9px 14px}
  .btn{padding:14px 30px}
  .doa{padding:8px 12px}
}
/* celular e tablet: foto em cima */
@media (max-width:960px){
  .dobra{grid-template-columns:1fr;grid-template-rows:auto;min-height:0}
  .foto{order:-1;height:min(118vw,640px)}
  .foto:after{background:linear-gradient(0deg,var(--noite) 0,rgba(14,13,16,0) 42%)}
  .info{padding:4px 20px 34px;gap:18px;margin-top:-64px;z-index:3}
  .info:before{display:none}
  .topo{order:-2}
  .logo-corre{width:min(300px,82vw)}
  .selo-giro{top:16px;right:16px;width:96px;height:96px}
  .parceria{left:16px;right:auto;top:16px;bottom:auto;padding:8px 14px 8px 10px;gap:12px;border-radius:16px}
  .parceria img{height:40px}
  .parceria p{font-size:10px}
  .parceria p b{font-size:13.5px}
  .legenda{display:none}
  .quando{gap:8px}
  .quando div{padding:10px 11px}
  .acao{flex-direction:column;align-items:stretch;gap:10px}
  .btn{justify-content:center;font-size:18px;padding:18px 20px}
  .vagas{text-align:center}
  .preco{text-align:center}
  .doa{flex-wrap:wrap}
  .doa span{flex:1 1 calc(100% - 60px)}
  .doa .sefras{margin-left:42px;padding:4px 7px}
  .doa .sefras img{height:17px}
  .local{grid-template-columns:1fr}
  .local iframe{min-height:190px}
  .rodape{padding:18px 20px;justify-content:center;text-align:center}
}
@media (max-width:380px){.quando b{font-size:16px}.inclui li{font-size:13px}}
</style>
</head>
<body>
<main class="dobra">
  <section class="info">
    <div class="topo rv" style="--d:.02s">
      <div class="marca"><img src="/marca/cda-icone.png" alt="" width="34" height="34">Canal do Anfitrião</div>
      <span class="vagas-topo">100 vagas</span>
    </div>

    <h2 class="rv" style="margin:0;--d:.06s">
      <svg class="logo-corre" viewBox="0 0 420 132" role="img" aria-label="Corre Anfitrião">
        <defs>
          <linearGradient id="gc" x1="0" y1="0" x2="1" y2=".25">
            <stop offset="0" stop-color="#ff8a65"/><stop offset=".45" stop-color="#ff385c"/><stop offset=".75" stop-color="#e61e4d"/><stop offset="1" stop-color="#bd1e59"/>
          </linearGradient>
        </defs>
        <!-- estrela do Canal do Anfitrião "correndo": rastros de velocidade -->
        <g stroke="url(#gc)" stroke-linecap="round" stroke-width="7">
          <line x1="4" y1="44" x2="38" y2="44" opacity=".55"/>
          <line x1="14" y1="62" x2="46" y2="62" opacity=".8"/>
          <line x1="4" y1="80" x2="36" y2="80" opacity=".55"/>
        </g>
        <path transform="translate(52 12) skewX(-10)" fill="url(#gc)" d="M52 0l14.6 31.2 34.2 4.2-25.2 23.5 6.6 33.8L52 76 21.8 92.7l6.6-33.8L3.2 35.4l34.2-4.2z"/>
        <text x="160" y="66" font-family="Plus Jakarta Sans,system-ui,sans-serif" font-weight="800" font-style="italic" font-size="64" letter-spacing="-2" fill="#fff">CORRE</text>
        <text x="163" y="116" font-family="Instrument Serif,Georgia,serif" font-style="italic" font-size="52" fill="url(#gc)">Anfitrião</text>
        <text x="372" y="96" text-anchor="middle" font-family="Plus Jakarta Sans,system-ui,sans-serif" font-weight="800" font-size="13" letter-spacing="1.5" fill="#fff" opacity=".9">5 KM</text>
      </svg>
    </h2>

    <h1 class="rv" style="--d:.1s">5 km pra <span class="serif grad-txt">fechar 2026</span> juntos.</h1>
    <p class="lead rv" style="--d:.14s">Bora correr 5 km para fechar o ano de 2026, tomar um café da manhã juntos e ajudar com um quilo de alimento não perecível para pessoas em situação de rua, doado para o programa Chá do Padre da Paróquia São Francisco de Assis.</p>

    <div class="quando rv" style="--d:.18s">
      <div><small>Data</small><b>12/12/2026</b></div>
      <div><small>Largada</small><b>07h00</b></div>
      <div><small>Percurso</small><b>5 km</b></div>
    </div>

    <p class="rot rv" style="--d:.2s">O que está incluso</p>
    <ul class="inclui rv" style="--d:.22s">
      <li><span>☕</span>Café da manhã</li>
      <li><span>👕</span>Camiseta de corrida do Canal do Anfitrião</li>
      <li><span>💬</span>Bate-papo entre anfitriões</li>
    </ul>

    <div class="doa rv" style="--d:.26s"><i>🤝</i><span>Ingresso: <b>R$ 147,00 + 1 kg de alimento não perecível</b>, que será doado para o programa Chá do Padre da Paróquia São Francisco de Assis.<small>O Chá do Padre é um serviço do Sefras – Ação Social Franciscana. <a href="https://www.sefras.org.br/" target="_blank" rel="noopener">Conheça o trabalho do Sefras ↗</a></small></span><a class="sefras" href="https://www.sefras.org.br/" target="_blank" rel="noopener" aria-label="Sefras – Ação Social Franciscana (abre em nova aba)"><img src="/lp/corrida/sefras.webp" alt="Sefras – Ação Social Franciscana" width="240" height="55" loading="lazy"></a></div>

    <div class="acao rv" style="--d:.3s">
      <span class="preco"><b>R$ 147,00</b>+ 1 kg de alimento</span>
      <a class="btn" id="comprar" href="${attr(checkout)}">Comprar agora <i>→</i></a>
      <span class="vagas"><b>100 participantes</b>Vagas limitadas</span>
    </div>

    <div class="local rv" style="--d:.34s">
      <div class="end">
        <small>Local</small>
        <b>Campus da USP</b>
        R. do Matão, 1577 · Butantã, São Paulo
        <a href="https://www.google.com/maps/search/?api=1&amp;query=R.%20do%20Mat%C3%A3o%2C%201577%20-%20Butant%C3%A3%2C%20S%C3%A3o%20Paulo" target="_blank" rel="noopener">Abrir no mapa ↗</a>
      </div>
      <iframe title="Mapa: R. do Matão, 1577 - Butantã, São Paulo" loading="lazy" referrerpolicy="no-referrer-when-downgrade" src="https://maps.google.com/maps?q=R.%20do%20Mat%C3%A3o%2C%201577%20-%20Butant%C3%A3%2C%20S%C3%A3o%20Paulo&amp;z=15&amp;output=embed"></iframe>
    </div>
  </section>

  <section class="foto">
    <picture>
      <source media="(max-width:960px)" srcset="/lp/corrida/foto-celular.webp">
      <img src="/lp/corrida/foto.webp" alt="Rômulo Villela e o treinador da E-Corpus Assessoria Esportiva em roupa de corrida no campus" width="1200" height="1490" fetchpriority="high">
    </picture>

    <svg class="selo-giro" viewBox="0 0 200 200" aria-hidden="true">
      <defs>
        <linearGradient id="gs" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ff8a65"/><stop offset=".5" stop-color="#ff385c"/><stop offset="1" stop-color="#bd1e59"/></linearGradient>
        <path id="anelp" d="M100,100 m-74,0 a74,74 0 1,1 148,0 a74,74 0 1,1 -148,0"/>
      </defs>
      <circle cx="100" cy="100" r="98" fill="#0e0d10"/>
      <circle cx="100" cy="100" r="96" fill="none" stroke="url(#gs)" stroke-width="3"/>
      <g class="anel"><text font-family="Plus Jakarta Sans,system-ui,sans-serif" font-weight="800" font-size="17" letter-spacing="3.2" fill="#fff"><textPath href="#anelp">CORRE ANFITRIÃO · 5 KM · 12.12.2026 ·</textPath></text></g>
      <path transform="translate(70 62) scale(.6)" fill="url(#gs)" d="M50 0l14.6 31.2 34.2 4.2-25.2 23.5 6.6 33.8L50 76 19.8 92.7l6.6-33.8L1.2 35.4l34.2-4.2z"/>
      <text x="100" y="138" text-anchor="middle" font-family="Plus Jakarta Sans,system-ui,sans-serif" font-weight="800" font-size="15" letter-spacing="1" fill="#fff">5 KM</text>
    </svg>

    <div class="parceria">
      <img src="/lp/corrida/ecorpus.webp" alt="E-Corpus Assessoria Esportiva" width="500" height="302">
      <span class="div"></span>
      <p>Parceria oficial<b>com E-Corpus</b></p>
    </div>
    <div class="legenda"><b>Rômulo Villela</b>com o treinador da E-Corpus</div>
  </section>

  <footer class="rodape">
    <span>Corre Anfitrião · 12/12/2026 · 07h00 · Campus da USP</span>
    <span>Canal do Anfitrião · Parceria oficial E-Corpus Assessoria Esportiva</span>
  </footer>
</main>
</body>
</html>
`;
}
