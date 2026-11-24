// LP do low ticket "Airbnb do Zero": link.canaldoanfitriao.com.br/airbnb-do-zero
// Página estática; fotos em public/lp/airbnb-do-zero/ e ícone em public/marca/. Bloco de prova (.pv) é SVG + CSS + JS aqui mesmo.

// Link do botão de compra (Eduzz, R$ 197): ÚNICO lugar pra trocar.
export const AIRBNB_DO_ZERO_CHECKOUT = "https://sun.eduzz.com/797ZPKY10E";

export function airbnbDoZeroHtml(): string {
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Airbnb do Zero · R$ 7.828 de faturamento em 30 dias no Airbnb · Canal do Anfitrião</title>
<meta name="description" content="Prepare o imóvel, tire as fotos com o celular, defina o preço e publique seu primeiro anúncio no Airbnb. 3 aulas com o Rômulo Villela, 3h30, acesso imediato.">
<meta property="og:title" content="Airbnb do Zero · Canal do Anfitrião">
<meta property="og:description" content="O método do Rômulo Villela pra quem nunca anunciou no Airbnb. 3 aulas, 3h30, R$ 197.">
<meta property="og:image" content="https://link.canaldoanfitriao.com.br/lp/airbnb-do-zero/og.jpg">
<link rel="icon" href="/icon-192.png">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Poppins:wght@500;600;700;800&family=Raleway:wght@400;500;600;700&family=Barlow:wght@500;600;700&display=swap" rel="stylesheet">
<style>
:root{--bg:#f6f6f6;--ink:#333;--ink-2:#4a4a4a;--muted:#69727d;--line:#ececec;--line-2:#dadada;
--coral:#e23d59;--coral-dark:#c92e49;--coral-wash:#fdeef1;--teal:#24757f;--teal-2:#2a8995;--teal-wash:#eaf5f6;
--dark:#1c1c1c;--dark-2:#141414;--shadow:0 10px 30px rgba(17,24,39,.06);--shadow-coral:0 10px 26px rgba(226,61,89,.28);
--title:"Poppins","Raleway",system-ui,sans-serif;--body:"Raleway",system-ui,-apple-system,"Segoe UI",sans-serif;--label:"Barlow","Raleway",system-ui,sans-serif}
*{box-sizing:border-box;margin:0;padding:0}
html{-webkit-text-size-adjust:100%;overflow-x:hidden}
body{font-family:var(--body);color:var(--ink);background:var(--bg);line-height:1.55;-webkit-font-smoothing:antialiased;overflow-x:hidden}
img{display:block;max-width:100%} a{color:inherit}
.wrap{width:100%;max-width:1120px;margin:0 auto;padding:0 20px}
h1,h2,h3{font-family:var(--title);font-weight:700;letter-spacing:-.02em;line-height:1.06;color:var(--ink)}
h1{font-size:clamp(2.4rem,7.4vw,4.4rem)} h2{font-size:clamp(1.9rem,5vw,3.2rem)} h3{font-size:clamp(1.15rem,2.6vw,1.45rem);line-height:1.2}
.c{color:var(--coral)} .t{color:var(--teal)}
.lead{font-size:clamp(1.05rem,2.3vw,1.3rem);line-height:1.55;color:var(--ink-2)}
.dark .lead{color:rgba(255,255,255,.82)}
.pill{display:inline-flex;align-items:center;gap:8px;font-family:var(--label);font-weight:600;font-size:.82rem;letter-spacing:.14em;text-transform:uppercase;padding:7px 16px;border-radius:999px;border:1px solid var(--line-2);color:var(--ink-2);background:#fff}
.pill.coral{background:var(--coral);border-color:var(--coral);color:#fff;box-shadow:var(--shadow-coral)}
.dark .pill{background:rgba(255,255,255,.06);border-color:rgba(255,255,255,.3);color:#fff}.dark .pill.coral{background:var(--coral);border-color:var(--coral)}
.label{font-family:var(--label);font-weight:700;font-size:.82rem;letter-spacing:.18em;text-transform:uppercase;color:var(--teal)}
.dark .label{color:#aadbe1}
section{position:relative;padding:clamp(64px,10vw,110px) 0;overflow-x:clip}
.dark{background:var(--dark);color:#fff} .dark h1,.dark h2,.dark h3{color:#fff}
.branco{background:#fff}
.glow::before{content:"";position:absolute;inset:0;pointer-events:none;background:radial-gradient(60% 55% at 88% 8%,rgba(226,61,89,.2),transparent 62%),radial-gradient(55% 60% at 0% 100%,rgba(36,117,127,.3),transparent 62%)}
.wrap{position:relative}
.cta{display:inline-flex;align-items:center;justify-content:center;gap:12px;background:var(--coral);color:#fff;text-decoration:none;font-family:var(--title);font-weight:700;font-size:clamp(1rem,2.4vw,1.15rem);padding:17px 30px;border-radius:999px;box-shadow:0 14px 34px -10px rgba(226,61,89,.7);text-align:center}
.cta:hover{background:var(--coral-dark)}
.nota{font-size:.92rem;color:var(--muted);margin-top:14px} .dark .nota{color:rgba(255,255,255,.6)}
.topo{position:absolute;left:0;right:0;top:0;z-index:5}
.topo .wrap{display:flex;align-items:center;justify-content:space-between;height:64px}
.marca{display:flex;align-items:center;gap:10px;font-family:var(--label);font-weight:700;font-size:.78rem;letter-spacing:.2em;color:rgba(255,255,255,.85);text-decoration:none}
.marca img{width:34px;height:34px;border-radius:9px}
.mini{font-family:var(--title);font-weight:600;font-size:.88rem;color:#fff;text-decoration:none;padding:9px 16px;border-radius:999px;background:rgba(255,255,255,.1);border:1px solid rgba(255,255,255,.22)}
.hero{padding:120px 0 80px}
.hero .grid{display:grid;grid-template-columns:minmax(0,1.08fr) minmax(0,.92fr);gap:56px;align-items:center}
.hero h1{margin:22px 0 20px} .hero .lead{max-width:600px;margin-bottom:32px}
.chips{display:flex;flex-wrap:wrap;gap:10px;margin-top:26px}
.chips span{font-family:var(--label);font-weight:600;font-size:.85rem;letter-spacing:.06em;color:rgba(255,255,255,.75);padding:7px 14px;border-radius:999px;border:1px solid rgba(255,255,255,.14);background:rgba(255,255,255,.04)}
.chips b{color:var(--coral)}
.retrato{position:relative;height:600px;border-radius:30px;overflow:hidden;background:#1a1a1a;border:1px solid rgba(255,255,255,.08);box-shadow:0 40px 90px rgba(0,0,0,.5)}
.retrato .foto{position:absolute;inset:0;background:linear-gradient(180deg,rgba(28,28,28,.1),rgba(36,117,127,.35)),url("/lp/airbnb-do-zero/mar.webp") 30% 40%/cover no-repeat}.retrato .rom{position:absolute;left:50%;bottom:-6%;height:100%;width:auto;max-width:none;transform:translateX(-50%);filter:drop-shadow(0 18px 40px rgba(0,0,0,.45))}
.retrato::after{content:"";position:absolute;inset:0;background:linear-gradient(180deg,transparent 58%,rgba(20,20,20,.92) 100%)}
.retrato .nome{position:absolute;left:26px;bottom:24px;z-index:2}
.retrato .nome b{display:block;font-family:var(--title);font-weight:700;font-size:1.6rem;line-height:1.1;color:#fff}
.retrato .nome span{display:block;margin-top:6px;font-family:var(--label);font-weight:600;font-size:.8rem;letter-spacing:.1em;text-transform:uppercase;color:rgba(255,255,255,.78);line-height:1.45}
.retrato .nome i{font-style:normal;color:var(--coral)}
.selo{position:absolute;right:-14px;top:34px;z-index:3;background:#fff;color:var(--ink);border-radius:20px;padding:14px 20px;box-shadow:0 20px 50px rgba(0,0,0,.4);text-align:center}
.selo small{display:block;font-family:var(--label);font-weight:700;font-size:.68rem;letter-spacing:.16em;text-transform:uppercase;color:var(--teal)}
.selo b{display:block;font-family:var(--title);font-weight:700;font-size:1.7rem;line-height:1.1;color:var(--coral)}
.cab{max-width:760px;margin-bottom:44px} .cab h2{margin-top:14px} .cab .lead{margin-top:16px}
.centro{text-align:center;margin-left:auto;margin-right:auto}
.cards{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:18px}
.card{background:#fff;border:1px solid var(--line);border-radius:22px;padding:26px 24px;box-shadow:var(--shadow)}
.card .ic{width:46px;height:46px;border-radius:14px;background:var(--coral-wash);color:var(--coral);display:flex;align-items:center;justify-content:center;font-family:var(--title);font-weight:700;font-size:1.2rem;margin-bottom:16px}
.card:nth-child(even) .ic{background:var(--teal-wash);color:var(--teal)}
.card p{margin-top:8px;color:var(--ink-2);font-size:1rem}
.passos{display:grid;gap:16px}
.passo{display:grid;grid-template-columns:76px 1fr;gap:22px;align-items:start;background:var(--bg);border:1px solid var(--line);border-radius:22px;padding:26px 28px}
.passo .n{width:64px;height:64px;border-radius:20px;background:var(--coral);color:#fff;font-family:var(--title);font-weight:700;font-size:1.8rem;display:flex;align-items:center;justify-content:center;box-shadow:var(--shadow-coral)}
.passo:nth-child(even) .n{background:var(--teal);box-shadow:0 10px 26px rgba(36,117,127,.28)}
.passo ul{list-style:none;margin-top:10px} .passo li{position:relative;padding-left:22px;color:var(--ink-2);margin-top:6px}
.passo li::before{content:"✓";position:absolute;left:0;color:var(--coral);font-weight:700}
.duo{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:56px;align-items:center}
.quadro{border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.04);border-radius:26px;padding:30px}
.quadro div{display:flex;gap:14px;align-items:center;padding:14px 0;border-bottom:1px solid rgba(255,255,255,.1);font-family:var(--title);font-weight:600;font-size:1.05rem}
.quadro div:last-child{border:0}
.quadro span{flex:none;font-family:var(--label);font-weight:700;font-size:.74rem;letter-spacing:.14em;color:#fff;background:var(--coral);border-radius:999px;padding:5px 12px}
.pv{--e:cubic-bezier(.2,.8,.2,1);--pop:cubic-bezier(.34,1.56,.64,1);position:relative;display:grid;grid-template-columns:minmax(0,1.02fr) minmax(0,.98fr);gap:36px;align-items:center;background:var(--dark);border-radius:34px;padding:34px;color:#fff;box-shadow:0 40px 80px -30px rgba(17,24,39,.55);overflow:hidden}
.pv::before{content:"";position:absolute;inset:0;pointer-events:none;background:radial-gradient(55% 60% at 100% 0,rgba(226,61,89,.24),transparent 62%),radial-gradient(55% 60% at 0 100%,rgba(36,117,127,.34),transparent 62%)}
.pv>*{position:relative;min-width:0}
.pv-svg{display:block;width:100%;height:auto;max-width:520px;margin:0 auto;overflow:visible}
.pv-svg text{text-anchor:middle;fill:#fff;font-family:var(--title);pointer-events:none}
.pv-svg .val{font-weight:700;letter-spacing:-.02em;font-variant-numeric:tabular-nums}
.pv-svg .mes{font-weight:700;font-size:18px}.pv-svg .sub{font-family:var(--label);font-weight:600;font-size:15px;fill:rgba(255,255,255,.72)}
.pv-b{cursor:pointer;outline:none;-webkit-tap-highlight-color:transparent;transition:opacity .35s}
.pv-b .hit{fill:transparent}.pv-b .corpo{transform-box:fill-box;transform-origin:50% 100%;transition:transform .5s var(--pop),filter .35s}
.pv-b .lz{fill:#ffe0a8}.pv-b .off{fill:rgba(0,0,0,.2)}
.pv.sel-set .pv-b.out,.pv.sel-out .pv-b.set{opacity:.42}
.pv.sel-set .pv-b.set .corpo,.pv.sel-out .pv-b.out .corpo{transform:scale(1.05,1);filter:drop-shadow(0 0 16px rgba(255,224,168,.4))}
.pv-b:focus-visible .corpo path:first-child{stroke:#fff;stroke-width:3}
.pv-svg .pisca{fill:#fff;opacity:.6;animation:pvpisca 3.2s ease-in-out calc(var(--k)*.37s) infinite}
.pv-svg .palma{transform-box:fill-box;transform-origin:50% 100%;animation:pvvento 5s ease-in-out infinite}.pv-svg .p2{animation-delay:-2s}
.pv-svg .onda{animation:pvonda 6s linear infinite}.pv-svg .o2{animation-duration:9s;animation-direction:reverse}
.pv-svg .seta{fill:none;stroke:#fff;stroke-width:3;stroke-linecap:round;stroke-dasharray:1 1}.pv-svg .ponta{fill:none;stroke:#fff;stroke-width:3;stroke-linecap:round;stroke-linejoin:round}
.pv-svg .faisca{stroke:#ffe0a8;stroke-width:3;stroke-linecap:round;opacity:0;transform-origin:278px 84px;transform:rotate(var(--a)) translateY(-28px)}
@keyframes pvpisca{0%,100%{opacity:.65}50%{opacity:.15}}
@keyframes pvvento{0%,100%{transform:rotate(-2.5deg)}50%{transform:rotate(3deg)}}
@keyframes pvonda{to{transform:translateX(80px)}}
@keyframes pvfaisca{0%{opacity:0;transform:rotate(var(--a)) translateY(-18px) scaleY(.3)}35%{opacity:1}100%{opacity:0;transform:rotate(var(--a)) translateY(-74px) scaleY(1)}}
.pv-dica{text-align:center;margin-top:12px;font-family:var(--label);font-weight:600;font-size:.9rem;color:rgba(255,255,255,.6)}.pv-dica .ms{display:none}
@media(hover:hover) and (pointer:fine){.pv:not(.toque) .pv-dica .ms{display:inline}.pv:not(.toque) .pv-dica .tq{display:none}}
.pv-lado{display:grid;gap:18px}
.pv-hist{position:relative;display:grid;gap:10px}
.pv-l{appearance:none;display:flex;gap:14px;align-items:flex-start;text-align:left;width:100%;font:inherit;color:#fff;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.14);border-radius:20px;padding:18px 20px;cursor:pointer;transition:background .3s,border-color .3s,transform .4s var(--pop);-webkit-tap-highlight-color:transparent}
.pv-l i{flex:none;width:14px;height:14px;border-radius:5px;margin-top:6px;background:#2f97a3}.pv-l.out i{background:var(--coral)}
.pv-l b{display:block;font-family:var(--title);font-weight:700;font-size:clamp(1.05rem,2vw,1.2rem);line-height:1.25}
.pv-l small{display:block;margin-top:4px;font-size:.95rem;line-height:1.4;color:rgba(255,255,255,.74)}
.pv.sel-set .pv-l.set,.pv.sel-out .pv-l.out{background:rgba(255,255,255,.12);border-color:rgba(255,255,255,.42);transform:translateX(6px)}
.pv-l:focus-visible{outline:3px solid #aadbe1;outline-offset:2px}
.pv-cards{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}
.pv-c{background:#f6f6f6;color:var(--ink);border-radius:22px;padding:22px 20px;display:flex;flex-direction:column;transition:transform .45s var(--pop),box-shadow .45s}
.pv-c .num{font-family:var(--title);font-weight:800;font-size:clamp(2.3rem,4.4vw,3.1rem);line-height:1;letter-spacing:-.03em;color:var(--teal);font-variant-numeric:tabular-nums}
.pv-c .tx{font-weight:600;font-size:.98rem;line-height:1.3;margin:8px 0 16px;color:var(--ink-2)}
.pv-c small{margin-top:12px;font-family:var(--label);font-weight:600;font-size:.86rem;color:#5d666f}
.pv-nts{display:grid;grid-template-columns:repeat(8,1fr);gap:5px;margin-top:auto}
.pv-nts i{aspect-ratio:1;border-radius:32%;background:#dcdfe1;transition:transform .4s var(--pop) calc(var(--k)*14ms),background .35s calc(var(--k)*14ms)}.pv-nts i.on{background:var(--teal)}
.pv-est{display:block;width:100%;max-width:210px;height:auto;margin:0 0 0 -4px;overflow:visible}
.pv-est .vazia{fill:#dfdfe2}.pv-est .cheia{fill:url(#pvouro);stroke:url(#pvouro);stroke-width:1.4;stroke-linejoin:round}.pv-est .luz{fill:#fff;opacity:.28}
.pv-est .cheia,.pv-est .luz{transform-origin:12px 12px}
.pv-est .rx{stroke:#ffb03a;stroke-width:1.5;stroke-linecap:round;opacity:0;transform-origin:12px 12px}
.pv-c.ests .tx b{display:block;font-family:var(--title);font-weight:800;font-size:clamp(1.15rem,2.2vw,1.42rem);line-height:1.15;letter-spacing:-.02em;color:var(--coral);white-space:nowrap}
.pv-c.ests .tx{margin-top:12px}
.pv-hosp{display:block;width:100%;max-width:150px;height:auto;margin-top:auto}
.pv-hosp .h{fill:#dcdfe1;transform-box:fill-box;transform-origin:50% 100%;transition:fill .35s,transform .45s var(--pop)}.pv-hosp .h.on{fill:var(--coral)}
@media(hover:hover) and (pointer:fine){.pv-c:hover{transform:translateY(-6px) rotate(-.6deg);box-shadow:0 22px 44px rgba(0,0,0,.4)}}
.pv-c.vivo .pv-nts i.on{animation:pvpulo .55s var(--e) calc(var(--k)*22ms)}
.pv-c.vivo .pv-est .cheia,.pv-c.vivo .pv-est .luz{animation:pvacende .6s var(--pop) calc(var(--k)*110ms) both}
.pv-c.vivo .pv-est .rx{animation:pvraio .6s ease-out calc(var(--k)*110ms + .12s)}
.pv-c.vivo .pv-hosp .h.on{animation:pvest .55s var(--e) calc(var(--k)*110ms + .3s)}
@keyframes pvpulo{40%{transform:scale(1.35);background:var(--coral)}}
@keyframes pvest{40%{translate:0 -4px}}
@keyframes pvacende{0%{transform:scale(0) rotate(-70deg)}100%{transform:none}}
@keyframes pvraio{0%{opacity:0;transform:scale(.5)}40%{opacity:1}100%{opacity:0;transform:scale(1.2)}}
.pv-nota{max-width:860px;margin:20px auto 0;font-size:.92rem;color:rgba(255,255,255,.78);text-align:center}
html.pvmv .pv-svg:not(.go) .pv-b .corpo{transform:scaleY(0)}
html.pvmv .pv-svg .pv-b .corpo{transition:transform 1.1s var(--e),filter .35s}
html.pvmv .pv-svg.go:not(.fim) .pv-b.out .corpo{transition:transform 1.5s var(--pop) 1.15s}
html.pvmv .pv-svg.fim .pv-b .corpo{transition:transform .5s var(--pop),filter .35s}
html.pvmv .pv-svg .val{transition:opacity .4s}html.pvmv .pv-svg:not(.go) .val{opacity:0}html.pvmv .pv-svg.go .out .val{transition-delay:1.15s}
html.pvmv .pv-svg .lz{transition:fill .5s calc(1.1s + var(--k)*45ms)}html.pvmv .pv-svg .out .lz{transition-delay:calc(2.1s + var(--k)*45ms)}html.pvmv .pv-svg:not(.go) .lz{fill:rgba(0,0,0,.22)}
html.pvmv .pv-svg .seta{transition:stroke-dashoffset .8s var(--e) .8s}html.pvmv .pv-svg:not(.go) .seta{stroke-dashoffset:1;opacity:0}
html.pvmv .pv-svg .ponta{transition:opacity .3s 1.45s}html.pvmv .pv-svg:not(.go) .ponta{opacity:0}
html.pvmv .pv-svg .lua{transition:transform 1.6s var(--e)}html.pvmv .pv-svg:not(.go) .lua{transform:translateY(120px)}
html.pvmv .pv-svg.go .faisca{animation:pvfaisca .9s ease-out calc(2.5s + var(--k)*25ms) 1 both}
html.pvmv .pv-l,html.pvmv .pv-c{transition:opacity .7s var(--e),transform .7s var(--pop),background .3s,border-color .3s,box-shadow .45s}
html.pvmv .pv-l:not(.go){opacity:0;transform:translateX(50px)}html.pvmv .pv-c:not(.go){opacity:0;transform:translateY(50px) scale(.94)}
html.pvmv .pv-c:not(.go) .pv-nts i{background:#dcdfe1;transform:scale(.4)}
html.pvmv .pv-c.go .pv-nts i{transition-delay:calc(.35s + var(--k)*48ms)}
html.pvmv .pv-c:not(.go) .pv-est .cheia,html.pvmv .pv-c:not(.go) .pv-est .luz{transform:scale(0) rotate(-70deg)}
html.pvmv .pv-c.go:not(.vivo) .pv-est .cheia,html.pvmv .pv-c.go:not(.vivo) .pv-est .luz{transition:transform .6s var(--pop) calc(.5s + var(--k)*.28s)}
html.pvmv .pv-c.go:not(.vivo) .pv-est .rx{animation:pvraio .7s ease-out calc(.65s + var(--k)*.28s) 1 both}
html.pvmv .pv-c:not(.go) .pv-hosp .h{fill:#dcdfe1;transform:scale(.6)}
html.pvmv .pv-c.go .pv-hosp .h{transition-delay:calc(2s + var(--k)*.15s)}
@media(max-width:860px){.pv{grid-template-columns:1fr;padding:18px;gap:20px;border-radius:28px}.pv-cards{gap:10px}.pv-c{padding:18px 16px}.pv-c .tx{font-size:.94rem}.pv.sel-set .pv-l.set,.pv.sel-out .pv-l.out{transform:none}}
@media(max-width:350px){.pv-cards{grid-template-columns:1fr}}
@media(prefers-reduced-motion:reduce){.pv *,.pv{animation:none!important;transition:none!important}}
.bio{display:grid;grid-template-columns:minmax(0,.82fr) minmax(0,1.18fr);gap:56px;align-items:center}
.bio .ft{position:relative;height:580px;border-radius:30px;overflow:hidden;background:radial-gradient(70% 55% at 50% 38%,rgba(255,255,255,.28),transparent 70%),linear-gradient(155deg,#2a8995,#24757f 48%,#e23d59 135%);box-shadow:var(--shadow)}
.bio .ft img{position:absolute;left:50%;bottom:0;height:94%;width:auto;max-width:none;transform:translateX(-50%)}
.nums{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin-top:28px}
.nums div{background:#fff;border:1px solid var(--line);border-radius:18px;padding:18px 18px 16px;box-shadow:var(--shadow);transition:transform .35s}
@media(hover:hover){.nums div:hover{transform:translateY(-4px)}}
.nums div:nth-child(even) b{color:var(--coral)}
.nums b{display:block;font-family:var(--title);font-weight:800;font-size:clamp(1.45rem,2.7vw,2rem);white-space:nowrap;letter-spacing:-.02em;color:var(--teal);line-height:1.1}
.nums span{font-family:var(--label);font-weight:600;font-size:.74rem;letter-spacing:.12em;text-transform:uppercase;color:var(--ink-2)}
.oferta{max-width:620px;margin:0 auto;background:#fff;color:var(--ink);border-radius:30px;padding:44px 40px;text-align:center;box-shadow:0 40px 90px rgba(0,0,0,.5);position:relative}
.oferta h3{font-size:1.5rem;margin-top:16px;color:var(--ink)}
.preco{font-family:var(--title);font-weight:800;font-size:clamp(3.4rem,10vw,5rem);line-height:1;color:var(--coral);letter-spacing:-.03em;margin:18px 0 6px}
.oferta ul{list-style:none;text-align:left;margin:26px 0 30px;border-top:1px solid var(--line)}
.oferta li{position:relative;padding:13px 0 13px 34px;border-bottom:1px solid var(--line);color:var(--ink-2);font-weight:500}
.oferta li::before{content:"✓";position:absolute;left:0;top:12px;width:22px;height:22px;border-radius:50%;background:var(--teal-wash);color:var(--teal);font-weight:700;font-size:.8rem;display:flex;align-items:center;justify-content:center}
.oferta .cta{width:100%}
.garantia{display:grid;grid-template-columns:96px 1fr;gap:24px;align-items:center;max-width:760px;margin:0 auto;background:var(--teal-wash);border-radius:26px;padding:30px 34px}
.garantia .g{width:96px;height:96px;border-radius:50%;background:var(--teal);color:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center;font-family:var(--title);font-weight:700;font-size:2.2rem;line-height:1}
.garantia .g small{font-family:var(--label);font-size:.7rem;letter-spacing:.16em;margin-top:2px}
.faq{max-width:820px;margin:0 auto;display:grid;gap:12px}
.faq div{background:#fff;border:1px solid var(--line);border-radius:18px;padding:22px 26px}
.faq p{margin-top:8px;color:var(--ink-2)}
.fundo{position:absolute;inset:0;background-size:cover;background-position:60% 50%;pointer-events:none}
.fundo::after{content:"";position:absolute;inset:0;background:linear-gradient(90deg,rgba(28,28,28,.96) 18%,rgba(28,28,28,.72) 60%,rgba(28,28,28,.55)),linear-gradient(180deg,transparent 70%,#1c1c1c)}
.fundo.fraco::after{background:linear-gradient(90deg,rgba(28,28,28,.95),rgba(28,28,28,.78))}
.fundo.forte::after{background:linear-gradient(180deg,rgba(20,24,26,.62),rgba(20,24,26,.82))}
.hero h1 .gr{display:block;font-size:1.36em;line-height:1;white-space:nowrap;margin-bottom:.08em}
.hero .lead b{color:#fff}
.quadro .qf{width:100%;height:auto;border-radius:18px;margin-bottom:12px}
.gal{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));grid-auto-rows:210px;gap:14px}
.gal figure{position:relative;border-radius:22px;overflow:hidden;background:#ddd}
.gal img{width:100%;height:100%;object-fit:cover;transition:transform .7s cubic-bezier(.2,.7,.2,1)}
.gal figcaption{position:absolute;left:12px;bottom:12px;background:rgba(28,28,28,.72);color:#fff;font-family:var(--label);font-weight:600;font-size:.82rem;padding:5px 12px;border-radius:999px}
.gal .g1{grid-column:span 2;grid-row:span 2}.gal .g2{grid-column:span 2}
@media(hover:hover){.gal figure:hover img{transform:scale(1.06)}}
.aviso{font-size:.92rem;font-weight:500;color:rgba(255,255,255,.78);max-width:600px;margin-top:18px}
footer{background:var(--dark-2);color:rgba(255,255,255,.55);font-size:.85rem;text-align:center;padding:34px 0}
@media(max-width:860px){
.hero{padding:96px 0 60px}.hero .grid,.duo{grid-template-columns:1fr;gap:34px}.palco{order:-1}.retrato{height:400px}
.retrato .rom{left:62%}.selo{right:auto;left:14px;top:14px;padding:10px 14px}.selo b{font-size:1.3rem}
.cards{grid-template-columns:1fr}.bio{grid-template-columns:minmax(0,1fr);gap:30px}.bio .ft{height:440px}.nums{grid-template-columns:repeat(2,minmax(0,1fr))}.gal{grid-template-columns:repeat(2,minmax(0,1fr));grid-auto-rows:150px;gap:10px}.gal figure{border-radius:16px}.gal figcaption{left:8px;bottom:8px;font-size:.74rem;padding:4px 10px}
.passo{grid-template-columns:1fr;gap:14px;padding:22px}.passo .n{width:54px;height:54px;font-size:1.5rem;border-radius:16px}
.cta{width:100%}.oferta{padding:34px 22px}.garantia{grid-template-columns:1fr;text-align:center;justify-items:center;padding:28px 22px}
.marca span{display:none}}
</style></head><body>
<section class="hero dark glow"><div class="fundo" style="background-image:url(/lp/airbnb-do-zero/balneario.webp)"></div>
<div class="topo"><div class="wrap"><a class="marca"><img src="/marca/cda-icone.png" alt=""><span>CANAL DO ANFITRIÃO</span></a><a class="mini" href="${AIRBNB_DO_ZERO_CHECKOUT}">Quero começar</a></div></div>
<div class="wrap"><div class="grid">
<div>
<span class="pill coral">Airbnb do Zero · pra quem nunca anunciou</span>
<h1><span class="c gr">R$ 7.828</span> de faturamento em 30 dias no Airbnb</h1>
<p class="lead"><b>Com um apartamento que começou do zero, sem nenhuma reserva.</b> O Rômulo Villela gravou o caminho pra você repetir no seu imóvel: a arrumação, as fotos com o celular, o preço e o anúncio publicado.</p>
<a class="cta" href="${AIRBNB_DO_ZERO_CHECKOUT}">Quero começar agora · R$ 197</a>
<p class="nota">Acesso imediato · Garantia de 7 dias · Pagamento seguro pela Eduzz</p>
<div class="chips"><span><b>✓</b> Do imóvel vazio ao anúncio no ar</span><span><b>✓</b> 3 aulas · 3h30</span><span><b>✓</b> Faça junto</span></div>
<p class="aviso">R$ 7.828 é o faturamento bruto do primeiro mês cheio no ar de um imóvel administrado pelo Rômulo, somando as reservas do Airbnb e do Booking. O resultado varia conforme o imóvel, a cidade e a sua dedicação. Não é promessa de ganho.</p>
</div>
<div class="palco"><div style="position:relative"><div class="retrato"><div class="foto"></div><img class="rom" src="/lp/airbnb-do-zero/romulo.webp" width="900" height="1280" alt="Rômulo Villela sorrindo"><div class="nome"><b>Rômulo Villela</b><span>Anfitrião desde 2016<br><i>60+ imóveis</i> · Canal do Anfitrião</span></div></div>
<div class="selo"><small>Curso completo</small><b>R$ 197</b></div></div></div>
</div></div></section>

<section><div class="wrap">
<div class="cab"><span class="label">Pra quem é</span><h2>Isso é pra você que <span class="c">ainda não anunciou</span>.</h2></div>
<div class="cards">
<div class="card"><div class="ic">1</div><h3>Tem um imóvel parado</h3><p>Apartamento vazio, casa de praia que fica fechada quase o ano todo ou um quarto sobrando.</p></div>
<div class="card"><div class="ic">2</div><h3>Nunca anunciou no Airbnb</h3><p>Já pensou em colocar, mas não sabe por onde começar nem quanto cobrar.</p></div>
<div class="card"><div class="ic">3</div><h3>Tem medo de fazer errado</h3><p>Não quer anúncio sem reserva, hóspede problemático nem dor de cabeça com o imóvel.</p></div>
<div class="card"><div class="ic">4</div><h3>Quer uma renda a mais</h3><p>Quer ver o imóvel ajudando a pagar as próprias contas no fim do mês.</p></div>
</div></div></section>

<section class="branco"><div class="wrap">
<div class="cab"><span class="label">O que você vai aprender</span><h2>Do imóvel vazio ao <span class="t">primeiro mês no ar</span>, em 3 aulas.</h2><p class="lead" style="margin-top:12px">3h30 de aula, com os vídeos inteiros.</p></div>
<div class="passos">
<div class="passo"><div class="n">1</div><div><h3>Preparando o imóvel pro Airbnb <small style="font-weight:600;color:var(--muted)">· 1h26</small></h3><ul><li>A vistoria e a arrumação do apartamento antes de anunciar</li><li>O que comprar e como tirar as fotos com o celular</li></ul></div></div>
<div class="passo"><div class="n">2</div><div><h3>Montando o anúncio do zero | Quanto cobrar? <small style="font-weight:600;color:var(--muted)">· 1h22</small></h3><ul><li>A conta da diária e como olhar os anúncios concorrentes</li><li>O anúncio criado tela por tela: título, descrição, regras, check-in e preço</li></ul></div></div>
<div class="passo"><div class="n">3</div><div><h3>O primeiro mês no ar: quanto rendeu <small style="font-weight:600;color:var(--muted)">· 42 min</small></h3><ul><li>O balanço real do 1º mês do anúncio</li><li>Os ajustes de preço e de estadia mínima</li></ul></div></div>
</div></div></section>

<section class="dark glow"><div class="fundo fraco" style="background-image:url(/lp/airbnb-do-zero/orla.webp)"></div><div class="wrap"><div class="duo">
<div><span class="pill">Na prática</span><h2 style="margin:18px 0">Você não vai ver teoria. Vai ver <span class="c">um anúncio nascer</span>.</h2>
<p class="lead">No curso, o Rômulo pega um apartamento de verdade, que nunca tinha sido anunciado, e mostra tudo: a arrumação, as fotos, a pesquisa de preço, o anúncio sendo criado e o balanço do primeiro mês no ar. Você acompanha e repete no seu imóvel.</p>
<p style="margin-top:30px"><a class="cta" href="${AIRBNB_DO_ZERO_CHECKOUT}">Quero meu primeiro anúncio no ar</a></p></div>
<div class="quadro"><img class="qf" loading="lazy" src="/lp/airbnb-do-zero/romulo-arrumando.webp" width="1200" height="750" alt="Rômulo arrumando a sala do apartamento de Balneário Camboriú"><div><span>01</span>Imóvel arrumado</div><div><span>02</span>Fotos feitas no celular</div><div><span>03</span>Preço definido</div><div><span>04</span>Anúncio publicado</div><div><span>05</span>Balanço do 1º mês</div></div>
</div></div></section>

<section class="branco" id="imovel"><div class="wrap">
<div class="cab"><span class="label">O apartamento da aula</span><h2>O imóvel é este, em <span class="t">Balneário Camboriú</span>.</h2><p class="lead">É o apartamento que o Rômulo arruma, fotografa e anuncia no curso. O anúncio começou com fotos de celular e depois ganhou fotos profissionais como estas.</p></div>
<div class="gal"><figure class="g1"><img loading="lazy" src="/lp/airbnb-do-zero/varanda.webp" width="1200" height="900" alt="A varanda, de frente pro mar"><figcaption>A varanda, de frente pro mar</figcaption></figure><figure class=""><img loading="lazy" src="/lp/airbnb-do-zero/sala.webp" width="900" height="675" alt="Sala"><figcaption>Sala</figcaption></figure><figure class=""><img loading="lazy" src="/lp/airbnb-do-zero/quarto.webp" width="900" height="675" alt="Quarto"><figcaption>Quarto</figcaption></figure><figure class=""><img loading="lazy" src="/lp/airbnb-do-zero/mesa.webp" width="900" height="675" alt="Mesa posta pra foto"><figcaption>Mesa posta pra foto</figcaption></figure><figure class=""><img loading="lazy" src="/lp/airbnb-do-zero/suite.webp" width="900" height="675" alt="Quarto com vista"><figcaption>Quarto com vista</figcaption></figure><figure class=""><img loading="lazy" src="/lp/airbnb-do-zero/copa.webp" width="900" height="675" alt="Copa e cozinha"><figcaption>Copa e cozinha</figcaption></figure><figure class=""><img loading="lazy" src="/lp/airbnb-do-zero/estar.webp" width="900" height="675" alt="Estar e varanda"><figcaption>Estar e varanda</figcaption></figure><figure class="g2"><img loading="lazy" src="/lp/airbnb-do-zero/orla.webp" width="1200" height="675" alt="Balneário Camboriú"><figcaption>Balneário Camboriú</figcaption></figure></div>
</div></section>

<section class="dark" id="resultado"><div class="fundo forte" style="background-image:url(/lp/airbnb-do-zero/balneario.webp)"></div><div class="wrap">
<div class="cab centro"><span class="label">Resultado real</span><h2>A virada, <span class="c">mês a mês</span></h2></div>
<div class="pv"><div class="pv-graf"><svg class="pv-svg" viewBox="0 0 400 424" role="group" aria-label="Gráfico de barras do faturamento bruto: R$ 2.498 em setembro, mês parcial, e R$ 7.828 em outubro">
<defs><linearGradient id="pvceu" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#151d22"/><stop offset=".62" stop-color="#1c3339"/><stop offset="1" stop-color="#56323c"/></linearGradient>
<linearGradient id="pvcor" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f0526c"/><stop offset="1" stop-color="#d1304c"/></linearGradient>
<linearGradient id="pvtea" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2f97a3"/><stop offset="1" stop-color="#24757f"/></linearGradient>
<clipPath id="pvclip"><rect width="400" height="424" rx="24"/></clipPath></defs>
<g clip-path="url(#pvclip)"><rect width="400" height="424" fill="url(#pvceu)"/><circle class="pisca" style="--k:0" cx="28" cy="40" r="1.6"/><circle class="pisca" style="--k:1" cx="62" cy="112" r="1.3"/><circle class="pisca" style="--k:2" cx="120" cy="30" r="1.4"/><circle class="pisca" style="--k:3" cx="150" cy="92" r="1.8"/><circle class="pisca" style="--k:4" cx="186" cy="48" r="1.3"/><circle class="pisca" style="--k:5" cx="376" cy="44" r="1.7"/><circle class="pisca" style="--k:6" cx="388" cy="120" r="1.3"/><circle class="pisca" style="--k:7" cx="24" cy="160" r="1.3"/><circle class="pisca" style="--k:8" cx="176" cy="150" r="1.2"/>
<g class="lua"><circle cx="74" cy="72" r="40" fill="#fff" opacity=".05"/><circle cx="74" cy="72" r="23" fill="#f9ecd6"/><circle cx="66" cy="66" r="4" fill="#e6d5b8"/><circle cx="82" cy="78" r="5.5" fill="#e6d5b8"/></g>
<path d="M0 340V318C40 300 70 306 112 316S200 296 250 312 350 300 400 314V340z" fill="#132a2f"/>
<g transform="translate(26 344) scale(0.95)"><g class="palma p1"><path d="M0 0C-3-22 2-40 9-58" fill="none" stroke="#6b4f45" stroke-width="5" stroke-linecap="round"/><g fill="#24757f"><path d="M9-58C-8-72-26-68-32-54-18-60-4-60 9-58z"/><path d="M9-58C26-74 44-68 48-52 36-60 24-60 9-58z"/><path d="M9-58C0-78-14-84-26-80-12-74-2-68 9-58z" fill="#2a8995"/><path d="M9-58C14-80 28-88 40-82 28-76 18-70 9-58z" fill="#2a8995"/><path d="M9-58C-2-50-12-40-12-28-6-40 2-50 9-58z" fill="#1d5f68"/></g></g></g><g transform="translate(190 344) scale(0.8)"><g class="palma p2"><path d="M0 0C-3-22 2-40 9-58" fill="none" stroke="#6b4f45" stroke-width="5" stroke-linecap="round"/><g fill="#24757f"><path d="M9-58C-8-72-26-68-32-54-18-60-4-60 9-58z"/><path d="M9-58C26-74 44-68 48-52 36-60 24-60 9-58z"/><path d="M9-58C0-78-14-84-26-80-12-74-2-68 9-58z" fill="#2a8995"/><path d="M9-58C14-80 28-88 40-82 28-76 18-70 9-58z" fill="#2a8995"/><path d="M9-58C-2-50-12-40-12-28-6-40 2-50 9-58z" fill="#1d5f68"/></g></g></g><g transform="translate(368 344) scale(1.05)"><g class="palma p1"><path d="M0 0C-3-22 2-40 9-58" fill="none" stroke="#6b4f45" stroke-width="5" stroke-linecap="round"/><g fill="#24757f"><path d="M9-58C-8-72-26-68-32-54-18-60-4-60 9-58z"/><path d="M9-58C26-74 44-68 48-52 36-60 24-60 9-58z"/><path d="M9-58C0-78-14-84-26-80-12-74-2-68 9-58z" fill="#2a8995"/><path d="M9-58C14-80 28-88 40-82 28-76 18-70 9-58z" fill="#2a8995"/><path d="M9-58C-2-50-12-40-12-28-6-40 2-50 9-58z" fill="#1d5f68"/></g></g></g>
<path class="seta" pathLength="1" d="M158 236C186 226 200 196 208 158"/><path class="ponta" d="M199 166L209 152 217 168"/>
<g class="pv-b set" tabindex="0" role="button" data-m="set"><rect class="hit" x="18" y="20" width="164" height="390"/><g class="corpo"><path fill="url(#pvtea)" d="M48 340V268a8 8 0 0 1 8-8H144a8 8 0 0 1 8 8V340z"/><path fill="#fff" opacity=".08" d="M48 340V268a8 8 0 0 1 8-8H85V340z"/><rect class="off" style="--k:4" x="57.6" y="274" width="14" height="13" rx="2.5"/><rect class="lz" style="--k:5" x="81.2" y="274" width="14" height="13" rx="2.5"/><rect class="lz" style="--k:6" x="104.8" y="274" width="14" height="13" rx="2.5"/><rect class="off" style="--k:7" x="128.4" y="274" width="14" height="13" rx="2.5"/><rect class="lz" style="--k:0" x="57.6" y="298" width="14" height="13" rx="2.5"/><rect class="lz" style="--k:1" x="81.2" y="298" width="14" height="13" rx="2.5"/><rect class="lz" style="--k:2" x="104.8" y="298" width="14" height="13" rx="2.5"/><rect class="lz" style="--k:3" x="128.4" y="298" width="14" height="13" rx="2.5"/></g><text class="val" x="100" y="246" style="font-size:24px">R$ 2.498</text></g>
<g class="pv-b out" tabindex="0" role="button" data-m="out"><rect class="hit" x="196" y="20" width="164" height="390"/><g class="corpo"><path fill="url(#pvcor)" d="M226 340V98a8 8 0 0 1 8-8H322a8 8 0 0 1 8 8V340z"/><path fill="#fff" opacity=".08" d="M226 340V98a8 8 0 0 1 8-8H263V340z"/><rect class="off" style="--k:32" x="235.6" y="104" width="14" height="13" rx="2.5"/><rect class="lz" style="--k:33" x="259.2" y="104" width="14" height="13" rx="2.5"/><rect class="lz" style="--k:34" x="282.8" y="104" width="14" height="13" rx="2.5"/><rect class="off" style="--k:35" x="306.4" y="104" width="14" height="13" rx="2.5"/><rect class="lz" style="--k:28" x="235.6" y="128" width="14" height="13" rx="2.5"/><rect class="lz" style="--k:29" x="259.2" y="128" width="14" height="13" rx="2.5"/><rect class="lz" style="--k:30" x="282.8" y="128" width="14" height="13" rx="2.5"/><rect class="lz" style="--k:31" x="306.4" y="128" width="14" height="13" rx="2.5"/><rect class="lz" style="--k:24" x="235.6" y="152" width="14" height="13" rx="2.5"/><rect class="lz" style="--k:25" x="259.2" y="152" width="14" height="13" rx="2.5"/><rect class="lz" style="--k:26" x="282.8" y="152" width="14" height="13" rx="2.5"/><rect class="lz" style="--k:27" x="306.4" y="152" width="14" height="13" rx="2.5"/><rect class="lz" style="--k:20" x="235.6" y="176" width="14" height="13" rx="2.5"/><rect class="lz" style="--k:21" x="259.2" y="176" width="14" height="13" rx="2.5"/><rect class="off" style="--k:22" x="282.8" y="176" width="14" height="13" rx="2.5"/><rect class="lz" style="--k:23" x="306.4" y="176" width="14" height="13" rx="2.5"/><rect class="lz" style="--k:16" x="235.6" y="200" width="14" height="13" rx="2.5"/><rect class="lz" style="--k:17" x="259.2" y="200" width="14" height="13" rx="2.5"/><rect class="lz" style="--k:18" x="282.8" y="200" width="14" height="13" rx="2.5"/><rect class="lz" style="--k:19" x="306.4" y="200" width="14" height="13" rx="2.5"/><rect class="lz" style="--k:12" x="235.6" y="224" width="14" height="13" rx="2.5"/><rect class="lz" style="--k:13" x="259.2" y="224" width="14" height="13" rx="2.5"/><rect class="lz" style="--k:14" x="282.8" y="224" width="14" height="13" rx="2.5"/><rect class="lz" style="--k:15" x="306.4" y="224" width="14" height="13" rx="2.5"/><rect class="lz" style="--k:8" x="235.6" y="248" width="14" height="13" rx="2.5"/><rect class="off" style="--k:9" x="259.2" y="248" width="14" height="13" rx="2.5"/><rect class="lz" style="--k:10" x="282.8" y="248" width="14" height="13" rx="2.5"/><rect class="lz" style="--k:11" x="306.4" y="248" width="14" height="13" rx="2.5"/><rect class="lz" style="--k:4" x="235.6" y="272" width="14" height="13" rx="2.5"/><rect class="lz" style="--k:5" x="259.2" y="272" width="14" height="13" rx="2.5"/><rect class="lz" style="--k:6" x="282.8" y="272" width="14" height="13" rx="2.5"/><rect class="lz" style="--k:7" x="306.4" y="272" width="14" height="13" rx="2.5"/><rect class="lz" style="--k:0" x="235.6" y="296" width="14" height="13" rx="2.5"/><rect class="lz" style="--k:1" x="259.2" y="296" width="14" height="13" rx="2.5"/><rect class="lz" style="--k:2" x="282.8" y="296" width="14" height="13" rx="2.5"/><rect class="lz" style="--k:3" x="306.4" y="296" width="14" height="13" rx="2.5"/></g><text class="val" x="278" y="74" style="font-size:32px">R$ 7.828</text></g>
<g class="brilho"><path class="faisca" style="--a:-80deg;--k:0" d="M278 78v-13"/><path class="faisca" style="--a:-60deg;--k:1" d="M278 78v-13"/><path class="faisca" style="--a:-40deg;--k:2" d="M278 78v-13"/><path class="faisca" style="--a:-20deg;--k:3" d="M278 78v-13"/><path class="faisca" style="--a:0deg;--k:4" d="M278 78v-13"/><path class="faisca" style="--a:20deg;--k:5" d="M278 78v-13"/><path class="faisca" style="--a:40deg;--k:6" d="M278 78v-13"/><path class="faisca" style="--a:60deg;--k:7" d="M278 78v-13"/><path class="faisca" style="--a:80deg;--k:8" d="M278 78v-13"/></g>
<rect y="340" width="400" height="84" fill="#17191b"/><path class="onda" d="M-80 341q20-8 40 0t40 0 40 0 40 0 40 0 40 0 40 0 40 0 40 0 40 0 40 0 40 0 40 0 40 0V352H-80z" fill="#2a8995" opacity=".55"/><path class="onda o2" d="M-80 344q20-7 40 0t40 0 40 0 40 0 40 0 40 0 40 0 40 0 40 0 40 0 40 0 40 0 40 0 40 0V356H-80z" fill="#24757f"/>
<g pointer-events="none"><text class="mes" x="100" y="384">Setembro</text><text class="sub" x="100" y="405">1º mês, parcial</text><text class="mes" x="278" y="384">Outubro</text><text class="sub" x="278" y="405">mês seguinte</text></g></g></svg><p class="pv-dica" aria-hidden="true"><span class="tq">Toque</span><span class="ms">Passe o mouse</span> nos prédios</p></div>
<div class="pv-lado">
<div class="pv-hist"><button type="button" class="pv-l set" data-m="set"><i></i><span><b>1º mês, parcial: R$ 2.498</b><small>A agenda abriu no meio do mês.</small></span></button><button type="button" class="pv-l out" data-m="out"><i></i><span><b>Mês seguinte: R$ 7.828</b><small>Faturamento bruto do primeiro mês cheio no ar.</small></span></button></div>
<div class="pv-cards">
<div class="pv-c noites"><b class="num" data-n="77" data-s="%">77%</b><span class="tx">de ocupação<br>no mês seguinte</span><div class="pv-nts" role="img" aria-label="24 de 31 noites reservadas"><i class="on" style="--k:0"></i><i class="on" style="--k:1"></i><i class="on" style="--k:2"></i><i class="on" style="--k:3"></i><i class="on" style="--k:4"></i><i class="on" style="--k:5"></i><i class="on" style="--k:6"></i><i class="on" style="--k:7"></i><i class="on" style="--k:8"></i><i class="on" style="--k:9"></i><i class="on" style="--k:10"></i><i class="on" style="--k:11"></i><i class="on" style="--k:12"></i><i class="on" style="--k:13"></i><i class="on" style="--k:14"></i><i class="on" style="--k:15"></i><i class="on" style="--k:16"></i><i class="on" style="--k:17"></i><i class="on" style="--k:18"></i><i class="on" style="--k:19"></i><i class="on" style="--k:20"></i><i class="on" style="--k:21"></i><i class="on" style="--k:22"></i><i class="on" style="--k:23"></i><i class="" style="--k:24"></i><i class="" style="--k:25"></i><i class="" style="--k:26"></i><i class="" style="--k:27"></i><i class="" style="--k:28"></i><i class="" style="--k:29"></i><i class="" style="--k:30"></i></div><small>24 de 31 noites reservadas</small></div>
<div class="pv-c ests"><svg class="pv-est" viewBox="-3 -5 138 33" aria-hidden="true"><defs><linearGradient id="pvouro" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffc24d"/><stop offset=".55" stop-color="#f58a4b"/><stop offset="1" stop-color="#e23d59"/></linearGradient></defs><g transform="translate(0 0)" style="--k:0"><path class="vazia" d="M12 1.8l3.1 6.5 7.1.9-5.2 4.9 1.3 7.1L12 17.8l-6.3 3.4L7 14.1 1.8 9.2l7.1-.9z"/><g class="rx"><path d="M12-1.5v-3.6" transform="rotate(0 12 12)"/><path d="M12-1.5v-3.6" transform="rotate(45 12 12)"/><path d="M12-1.5v-3.6" transform="rotate(90 12 12)"/><path d="M12-1.5v-3.6" transform="rotate(135 12 12)"/><path d="M12-1.5v-3.6" transform="rotate(180 12 12)"/><path d="M12-1.5v-3.6" transform="rotate(225 12 12)"/><path d="M12-1.5v-3.6" transform="rotate(270 12 12)"/><path d="M12-1.5v-3.6" transform="rotate(315 12 12)"/></g><path class="cheia" d="M12 1.8l3.1 6.5 7.1.9-5.2 4.9 1.3 7.1L12 17.8l-6.3 3.4L7 14.1 1.8 9.2l7.1-.9z"/><path class="luz" d="M12 1.8l3.1 6.5L12 12 8.9 8.3z"/></g><g transform="translate(27 0)" style="--k:1"><path class="vazia" d="M12 1.8l3.1 6.5 7.1.9-5.2 4.9 1.3 7.1L12 17.8l-6.3 3.4L7 14.1 1.8 9.2l7.1-.9z"/><g class="rx"><path d="M12-1.5v-3.6" transform="rotate(0 12 12)"/><path d="M12-1.5v-3.6" transform="rotate(45 12 12)"/><path d="M12-1.5v-3.6" transform="rotate(90 12 12)"/><path d="M12-1.5v-3.6" transform="rotate(135 12 12)"/><path d="M12-1.5v-3.6" transform="rotate(180 12 12)"/><path d="M12-1.5v-3.6" transform="rotate(225 12 12)"/><path d="M12-1.5v-3.6" transform="rotate(270 12 12)"/><path d="M12-1.5v-3.6" transform="rotate(315 12 12)"/></g><path class="cheia" d="M12 1.8l3.1 6.5 7.1.9-5.2 4.9 1.3 7.1L12 17.8l-6.3 3.4L7 14.1 1.8 9.2l7.1-.9z"/><path class="luz" d="M12 1.8l3.1 6.5L12 12 8.9 8.3z"/></g><g transform="translate(54 0)" style="--k:2"><path class="vazia" d="M12 1.8l3.1 6.5 7.1.9-5.2 4.9 1.3 7.1L12 17.8l-6.3 3.4L7 14.1 1.8 9.2l7.1-.9z"/><g class="rx"><path d="M12-1.5v-3.6" transform="rotate(0 12 12)"/><path d="M12-1.5v-3.6" transform="rotate(45 12 12)"/><path d="M12-1.5v-3.6" transform="rotate(90 12 12)"/><path d="M12-1.5v-3.6" transform="rotate(135 12 12)"/><path d="M12-1.5v-3.6" transform="rotate(180 12 12)"/><path d="M12-1.5v-3.6" transform="rotate(225 12 12)"/><path d="M12-1.5v-3.6" transform="rotate(270 12 12)"/><path d="M12-1.5v-3.6" transform="rotate(315 12 12)"/></g><path class="cheia" d="M12 1.8l3.1 6.5 7.1.9-5.2 4.9 1.3 7.1L12 17.8l-6.3 3.4L7 14.1 1.8 9.2l7.1-.9z"/><path class="luz" d="M12 1.8l3.1 6.5L12 12 8.9 8.3z"/></g><g transform="translate(81 0)" style="--k:3"><path class="vazia" d="M12 1.8l3.1 6.5 7.1.9-5.2 4.9 1.3 7.1L12 17.8l-6.3 3.4L7 14.1 1.8 9.2l7.1-.9z"/><g class="rx"><path d="M12-1.5v-3.6" transform="rotate(0 12 12)"/><path d="M12-1.5v-3.6" transform="rotate(45 12 12)"/><path d="M12-1.5v-3.6" transform="rotate(90 12 12)"/><path d="M12-1.5v-3.6" transform="rotate(135 12 12)"/><path d="M12-1.5v-3.6" transform="rotate(180 12 12)"/><path d="M12-1.5v-3.6" transform="rotate(225 12 12)"/><path d="M12-1.5v-3.6" transform="rotate(270 12 12)"/><path d="M12-1.5v-3.6" transform="rotate(315 12 12)"/></g><path class="cheia" d="M12 1.8l3.1 6.5 7.1.9-5.2 4.9 1.3 7.1L12 17.8l-6.3 3.4L7 14.1 1.8 9.2l7.1-.9z"/><path class="luz" d="M12 1.8l3.1 6.5L12 12 8.9 8.3z"/></g><g transform="translate(108 0)" style="--k:4"><path class="vazia" d="M12 1.8l3.1 6.5 7.1.9-5.2 4.9 1.3 7.1L12 17.8l-6.3 3.4L7 14.1 1.8 9.2l7.1-.9z"/><g class="rx"><path d="M12-1.5v-3.6" transform="rotate(0 12 12)"/><path d="M12-1.5v-3.6" transform="rotate(45 12 12)"/><path d="M12-1.5v-3.6" transform="rotate(90 12 12)"/><path d="M12-1.5v-3.6" transform="rotate(135 12 12)"/><path d="M12-1.5v-3.6" transform="rotate(180 12 12)"/><path d="M12-1.5v-3.6" transform="rotate(225 12 12)"/><path d="M12-1.5v-3.6" transform="rotate(270 12 12)"/><path d="M12-1.5v-3.6" transform="rotate(315 12 12)"/></g><path class="cheia" d="M12 1.8l3.1 6.5 7.1.9-5.2 4.9 1.3 7.1L12 17.8l-6.3 3.4L7 14.1 1.8 9.2l7.1-.9z"/><path class="luz" d="M12 1.8l3.1 6.5L12 12 8.9 8.3z"/></g></svg><span class="tx"><b>3 de cada 4</b> hóspedes deram 5 estrelas</span><svg class="pv-hosp" viewBox="0 0 148 34" aria-hidden="true"><g transform="translate(0 0)"><g class="h on" style="--k:0"><circle cx="17" cy="9" r="8"/><path d="M1 34c0-9 7-14.500 16-14.500s16 5.500 16 14.500z"/></g></g><g transform="translate(38 0)"><g class="h on" style="--k:1"><circle cx="17" cy="9" r="8"/><path d="M1 34c0-9 7-14.500 16-14.500s16 5.500 16 14.500z"/></g></g><g transform="translate(76 0)"><g class="h on" style="--k:2"><circle cx="17" cy="9" r="8"/><path d="M1 34c0-9 7-14.500 16-14.500s16 5.500 16 14.500z"/></g></g><g transform="translate(114 0)"><g class="h " style="--k:3"><circle cx="17" cy="9" r="8"/><path d="M1 34c0-9 7-14.500 16-14.500s16 5.500 16 14.500z"/></g></g></svg><small>nas primeiras avaliações</small></div>
</div></div></div>
<p class="pv-nota">Faturamento bruto de um imóvel real administrado pelo Rômulo, somando as reservas do Airbnb e do Booking. O resultado varia conforme o imóvel.</p>
</div></section>

<section><div class="wrap"><div class="bio">
<div class="ft"><img loading="lazy" src="/lp/airbnb-do-zero/romulo.webp" width="900" height="1280" alt="Rômulo Villela sorrindo"></div>
<div><span class="label">Quem vai te ensinar</span><h2 style="margin:14px 0 18px">Rômulo Villela</h2>
<p class="lead">Em 2016, o Rômulo colocou um quarto no Airbnb pra ajudar a pagar o aluguel. Hoje ele tem <b>mais de 60 imóveis sob gestão</b> e já passou de <b>11 mil locações</b>.</p>
<p class="lead" style="margin-top:14px">É o criador do Canal do Anfitrião e do Anfitrião 5 Estrelas, a comunidade de anfitriões do canal, e palestrante em eventos oficiais do Airbnb.</p>
<div class="nums"><div><b>10+</b><span>anos de Airbnb</span></div><div><b>60+</b><span>imóveis sob gestão</span></div><div><b>11 mil+</b><span>locações</span></div><div><b>2.000+</b><span>alunos nos cursos</span></div><div><b>200 mil+</b><span>no Instagram</span></div><div><b>120 mil+</b><span>no YouTube</span></div></div></div>
</div></div></section>

<section class="dark glow" id="oferta"><div class="wrap">
<div class="oferta"><span class="pill coral">Airbnb do Zero</span><h3>Curso completo, acesso imediato</h3>
<div class="preco">R$ 197</div><p style="color:var(--muted)">à vista, ou parcelado no cartão</p>
<ul><li>3 aulas com os vídeos inteiros, 3h30 no total</li><li>Do imóvel vazio ao anúncio publicado e ao balanço do 1º mês</li><li>Assista quando e quantas vezes quiser</li><li>Garantia de 7 dias: não gostou, devolvemos seu dinheiro</li></ul>
<a class="cta" href="${AIRBNB_DO_ZERO_CHECKOUT}">Quero começar agora</a>
<p class="nota" style="color:var(--muted)">Pagamento seguro pela Eduzz · Pix ou cartão</p></div>
</div></section>

<section class="branco"><div class="wrap">
<div class="garantia"><div class="g">7<small>DIAS</small></div><div><h3>Garantia de 7 dias</h3><p style="margin-top:8px;color:var(--ink-2)">Entre, assista às aulas e, se não for pra você, é só pedir o reembolso dentro de 7 dias. Devolvemos o valor.</p></div></div>
</div></section>

<section><div class="wrap">
<div class="cab centro"><span class="label">Perguntas frequentes</span><h2>Antes de começar</h2></div>
<div class="faq">
<div><h3>Nunca usei o Airbnb como anfitrião. Vou conseguir acompanhar?</h3><p>Sim. O curso foi feito pra quem está começando do zero. O Rômulo mostra cada tela e você faz junto.</p></div>
<div><h3>Preciso ter um imóvel próprio?</h3><p>Você precisa de um espaço pra anunciar: pode ser um apartamento, uma casa, um quarto. O curso ensina a preparar e anunciar esse espaço.</p></div>
<div><h3>Em quanto tempo eu coloco meu anúncio no ar?</h3><p>Depende do seu ritmo e de como está o imóvel. São 3 aulas, 3h30 no total, pra você assistir e já ir fazendo.</p></div>
<div><h3>Quanto eu vou ganhar?</h3><p>Depende do seu imóvel, da cidade e da sua dedicação. O curso ensina a estimar o potencial do seu imóvel antes de começar. Não prometemos resultado.</p></div>
<div><h3>Como recebo o acesso?</h3><p>Assim que o pagamento é aprovado, você recebe o acesso por e-mail e assiste pela área de membros.</p></div>
<div><h3>E se eu não gostar?</h3><p>Você tem 7 dias de garantia. É só pedir o reembolso dentro desse prazo.</p></div>
</div></div></section>

<section class="dark glow"><div class="wrap centro" style="max-width:820px">
<h2>Seu imóvel pode estar <span class="c">no ar</span> no mês que vem.</h2>
<p class="lead" style="margin:18px 0 30px">Comece pelo começo, com quem faz isso todo dia.</p>
<a class="cta" href="${AIRBNB_DO_ZERO_CHECKOUT}">Quero começar agora · R$ 197</a>
<p class="nota">Acesso imediato · Garantia de 7 dias</p>
</div></section>
<footer><div class="wrap">Canal do Anfitrião Educação e Treinamentos LTDA · Este site não é afiliado ao Airbnb.<br>Resultados variam de acordo com o imóvel, a localização e a dedicação de cada pessoa.</div></footer>
<script>
(function(){
var D=document,pv=D.querySelector('.pv');if(!pv)return;
var RM=window.matchMedia&&matchMedia('(prefers-reduced-motion: reduce)').matches;
function all(q){return [].slice.call(pv.querySelectorAll(q))}
/* liga barra e linha da história: mouse, toque e teclado */
var fixo='';
/* dica: alguns celulares se anunciam como mouse */
if(navigator.maxTouchPoints>0&&window.matchMedia&&matchMedia('(max-width: 860px)').matches)pv.classList.add('toque');
pv.addEventListener('pointerdown',function(v){if(v.pointerType==='touch')pv.classList.add('toque')});
function sel(m){pv.classList.toggle('sel-set',m==='set');pv.classList.toggle('sel-out',m==='out');all('[data-m]').forEach(function(e){e.setAttribute('aria-pressed',e.getAttribute('data-m')===m?'true':'false')})}
all('.pv-b').forEach(function(g){g.setAttribute('aria-label',g.getAttribute('data-m')==='set'?'Setembro, mês parcial: R$ 2.498':'Outubro, mês seguinte: R$ 7.828')});
all('[data-m]').forEach(function(e){var m=e.getAttribute('data-m');
e.addEventListener('pointerenter',function(v){if(v.pointerType==='mouse')sel(m)});
e.addEventListener('pointerleave',function(v){if(v.pointerType==='mouse')sel(fixo)});
e.addEventListener('click',function(){fixo=fixo===m?'':m;sel(fixo)});
if(e.tagName!=='BUTTON')e.addEventListener('keydown',function(v){if(v.key==='Enter'||v.key===' '){v.preventDefault();fixo=fixo===m?'':m;sel(fixo)}})});
sel('');
if(RM||!('IntersectionObserver' in window))return;
/* cartões: pulso ao passar o mouse ou tocar */
all('.pv-c').forEach(function(c){function viva(){if(c.classList.contains('vivo'))return;c.classList.add('vivo');setTimeout(function(){c.classList.remove('vivo')},1400)}
c.addEventListener('pointerenter',function(v){if(v.pointerType==='mouse')viva()});c.addEventListener('click',viva)});
function fmt(v,d,r){var s=v.toFixed(d).split('.');var a=s[0];if(a.length>3)a=a.slice(0,-3)+'.'+a.slice(-3);return (r||'')+a+(d?','+s[1]:'')}
function conta(el,alvo,dec,pre,suf,ms,esp){var fim=el.textContent;el.textContent=fmt(0,dec,pre)+suf;setTimeout(function(){var t0=performance.now();(function f(n){var p=Math.min(1,Math.max(0,(n-t0)/ms)),e=p>=1?1:1-Math.pow(2,-9*p);if(p<1){el.textContent=fmt(alvo*e,dec,pre)+suf;requestAnimationFrame(f)}else el.textContent=fim})(t0)},esp)}
D.documentElement.classList.add('pvmv');
var io=new IntersectionObserver(function(ent){ent.forEach(function(x){if(!x.isIntersecting)return;var e=x.target;io.unobserve(e);e.classList.add('go');
if(e.classList.contains('pv-svg')){conta(e.querySelector('.set .val'),2498,0,'R$ ','',1100,250);conta(e.querySelector('.out .val'),7828,0,'R$ ','',1900,1200);setTimeout(function(){e.classList.add('fim')},3400)}
var n=e.classList.contains('pv-c')&&e.querySelector('.num');if(n)conta(n,+n.getAttribute('data-n'),+(n.getAttribute('data-d')||0),'',n.getAttribute('data-s')||'',1700,300)})},{threshold:.3});
all('.pv-svg,.pv-l,.pv-c').forEach(function(e){io.observe(e)});
})();
</script>
</body></html>
`;
}
