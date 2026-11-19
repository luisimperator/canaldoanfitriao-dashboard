// LP do Max como produto avulso (Fernando, 19/11: "vender o Max como
// standalone product. O call to action é falar com ele pra ganhar uma análise
// grátis"; "deixa no nível do /deck"; "a url do max pode ser /max").
// Mesma identidade e animações do deck (deck-a5e): Poppins/Raleway/Barlow,
// coral #e23d59, teal #24757f, revelação com blur, mesinha de 3 pernas,
// chat com "digitando" e anel tracejado girando no avatar.
// Rota: src/app/max/route.ts. Rosto do Max: src/app/max/avatar.jpg/route.ts.

import { PIXEL_PADRAO } from "@/lib/imersao-lp";

// Número do Max e a primeira mensagem (o Max reconhece o pedido da análise).
export const MAX_WHATSAPP = "5511911647699";
export const MAX_MENSAGEM = "Oi, Max! Vim pegar minha análise grátis 🎁";

// A mensagem pronta muda conforme o utm_source do link (Fernando, 19/11:
// "quando o UTM é story ou stories, aí a mensagem é: vi nos stories do Rômulo e
// vim pegar o negócio grátis"). O clique pro WhatsApp não leva UTM; assim o Max
// sabe de onde a pessoa veio. Toda variação mantém "vim pegar minha análise
// grátis". Origem fora da lista vai entre parênteses no fim.
const ORIGENS: [RegExp, string][] = [
  [/^(ig_?|insta(gram)?_?)?stor(y|ies|ie)$/, "nos stories do Rômulo"],
  [/^(ig|insta|instagram|bio|feed|reels?)$/, "no Instagram do Rômulo"],
  [/^(yt|youtube)$/, "no YouTube do Rômulo"],
  [/^(e-?mail|mailchimp|newsletter)$/, "no e-mail do Rômulo"],
  [/^live$/, "na live do Rômulo"],
  [/^tiktok$/, "no TikTok do Rômulo"],
  [/^(fb|facebook|meta|ads?|anuncio|paid)$/, "o anúncio do Rômulo"],
];

export function mensagemMax(utmSource: string | null | undefined): string {
  const s = (utmSource ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
  if (!s) return MAX_MENSAGEM;
  const achou = ORIGENS.find(([re]) => re.test(s));
  if (achou) return `Oi, Max! Vi ${achou[1]} e vim pegar minha análise grátis 🎁`;
  const limpo = s.replace(/[^a-z0-9_-]/g, "").slice(0, 30);
  return limpo ? `${MAX_MENSAGEM} (${limpo})` : MAX_MENSAGEM;
}

// Sem preço na página (Fernando, 19/11: "tira o preço da pagina. tamo perdendo
// aura"): o Max passa a condição no WhatsApp, depois da análise grátis.

function attr(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

export function maxLink(mensagem: string = MAX_MENSAGEM): string {
  return `https://wa.me/${MAX_WHATSAPP}?text=${encodeURIComponent(mensagem)}`;
}

const WA_ICON = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm5.8 14.2c-.2.7-1.4 1.3-2 1.4-.5.1-1.2.1-1.9-.1-.4-.1-1-.3-1.7-.6-3-1.3-4.9-4.3-5.1-4.5-.1-.2-1.2-1.6-1.2-3.1s.8-2.2 1-2.5c.3-.3.6-.4.8-.4h.6c.2 0 .4 0 .6.5l.9 2.1c.1.2.1.4 0 .5l-.3.5-.4.5c-.1.1-.3.3-.1.6.2.3.8 1.3 1.7 2.1 1.2 1 2.1 1.4 2.4 1.5.3.2.5.1.6-.1l.9-1c.2-.3.4-.2.6-.1l2 1c.3.1.5.2.5.3.1.2.1.6-.1 1.3z"/></svg>`;

export function maxHtml(opts: { mensagem?: string } = {}): string {
  const mensagem = opts.mensagem ?? MAX_MENSAGEM;
  const link = attr(maxLink(mensagem));
  const pixel = process.env.MAX_META_PIXEL_ID?.trim() || process.env.IMERSAO_META_PIXEL_ID?.trim() || PIXEL_PADRAO;
  const cta = (texto: string, extra = "") =>
    `<a class="cta${extra}" href="${link}" target="_blank" rel="noopener" data-cta>${WA_ICON}<span>${texto}</span></a>`;
  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>Max, o Concierge · Análise grátis do seu anúncio · Canal do Anfitrião</title>
<meta name="description" content="O Max é a IA do Canal do Anfitrião: estudou todas as aulas do Rômulo e analisa o seu anúncio do Airbnb de graça, mostrando o que mudar pra ter mais reservas. É só mandar um oi no WhatsApp.">
<meta property="og:title" content="Max, o Concierge · análise grátis do seu anúncio">
<meta property="og:description" content="O Rômulo no seu bolso, 24 horas. Mande um oi pro Max no WhatsApp e receba a análise do seu anúncio de graça.">
<meta property="og:image" content="https://link.canaldoanfitriao.com.br/marca/a5e-hero.webp">
<meta property="og:type" content="website">
<meta name="theme-color" content="#141414">
<link rel="icon" href="/marca/cda-icone.png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Poppins:wght@500;600;700;800&family=Raleway:wght@400;500;600;700&family=Barlow:wght@500;600;700&display=swap" rel="stylesheet">
<style>
:root{
  --bg:#f6f6f6;--card:#fff;--ink:#333;--ink-2:#4a4a4a;--muted:#69727d;--line:#ececec;--line-2:#dadada;
  --coral:#e23d59;--coral-dark:#c92e49;--coral-wash:#fdeef1;
  --teal:#24757f;--teal-2:#2a8995;--teal-light:#aadbe1;--teal-wash:#eaf5f6;
  --dark:#1c1c1c;--dark-2:#141414;--wa:#25d366;
  --shadow:0 10px 30px rgba(17,24,39,.06);--shadow-coral:0 10px 26px rgba(226,61,89,.28);
  --title:"Poppins","Raleway",system-ui,sans-serif;--body:"Raleway",system-ui,-apple-system,"Segoe UI",sans-serif;--label:"Barlow","Raleway",system-ui,sans-serif;
  --ease:cubic-bezier(.16,1,.3,1);--spring:cubic-bezier(.34,1.56,.64,1);
}
*{box-sizing:border-box;margin:0;padding:0}
html{-webkit-text-size-adjust:100%;scroll-behavior:smooth;overflow-x:hidden;overflow-x:clip}
body{font-family:var(--body);color:var(--ink);background:var(--bg);line-height:1.55;-webkit-font-smoothing:antialiased;overflow-x:hidden;overflow-x:clip}
section{overflow-x:clip}
img{display:block;max-width:100%}
a{color:inherit}
.wrap{width:100%;max-width:1120px;margin:0 auto;padding:0 20px}
h1,h2,h3{font-family:var(--title);font-weight:700;letter-spacing:-.02em;line-height:1.06;color:var(--ink)}
h1{font-size:clamp(2.4rem,7.4vw,4.6rem)}
h2{font-size:clamp(1.9rem,5vw,3.2rem)}
h3{font-size:clamp(1.15rem,2.6vw,1.45rem);line-height:1.2}
.c{color:var(--coral)} .t{color:var(--teal)}
.lead{font-size:clamp(1.05rem,2.3vw,1.3rem);line-height:1.55;color:var(--ink-2)}
.dark .lead{color:rgba(255,255,255,.82)}
.pill{display:inline-flex;align-items:center;gap:8px;font-family:var(--label);font-weight:600;font-size:.82rem;letter-spacing:.14em;text-transform:uppercase;padding:7px 16px;border-radius:999px;border:1px solid var(--line-2);color:var(--ink-2);background:#fff}
.pill.coral{background:var(--coral);border-color:var(--coral);color:#fff;box-shadow:var(--shadow-coral)}
.dark .pill{background:rgba(255,255,255,.06);border-color:rgba(255,255,255,.3);color:#fff}
.dark .pill.coral{background:var(--coral);border-color:var(--coral)}
.label{font-family:var(--label);font-weight:700;font-size:.82rem;letter-spacing:.18em;text-transform:uppercase;color:var(--teal)}
section{position:relative;padding:clamp(64px,10vw,110px) 0}
.dark{background:var(--dark);color:#fff}
.dark h1,.dark h2,.dark h3{color:#fff}
.glow::before{content:"";position:absolute;inset:0;pointer-events:none;background:radial-gradient(60% 55% at 88% 8%,rgba(226,61,89,.2),transparent 62%),radial-gradient(55% 60% at 0% 100%,rgba(36,117,127,.3),transparent 62%)}

/* botão */
.cta{display:inline-flex;align-items:center;justify-content:center;gap:12px;background:var(--coral);color:#fff;text-decoration:none;font-family:var(--title);font-weight:700;font-size:clamp(1rem,2.4vw,1.15rem);padding:17px 28px;border-radius:999px;box-shadow:var(--shadow-coral);transition:transform .35s var(--spring),background .2s;position:relative;isolation:isolate}
.cta svg{width:24px;height:24px;fill:#fff;flex:none}
.cta:hover{background:var(--coral-dark);transform:translateY(-2px) scale(1.02)}
.cta::after{content:"";position:absolute;inset:0;border-radius:inherit;box-shadow:0 0 0 0 rgba(226,61,89,.55);animation:pulso 2.4s infinite;z-index:-1}
@keyframes pulso{0%{box-shadow:0 0 0 0 rgba(226,61,89,.5)}70%{box-shadow:0 0 0 18px rgba(226,61,89,0)}100%{box-shadow:0 0 0 0 rgba(226,61,89,0)}}
.nota{font-size:.92rem;color:var(--muted);margin-top:14px}
.dark .nota{color:rgba(255,255,255,.6)}

/* revelação (como as etapas do deck) */
.rv{opacity:0;transform:translateY(34px);filter:blur(6px);transition:opacity .7s var(--ease),transform .9s var(--ease),filter .7s var(--ease);transition-delay:var(--d,0s)}
.rv.pop{transform:scale(.86)} .rv.esq{transform:translateX(-50px)} .rv.dir{transform:translateX(50px)}
.rv.on{opacity:1;transform:none;filter:none}

/* topo fixo */
.topo{position:fixed;left:0;right:0;top:0;z-index:50;transition:background .4s,box-shadow .4s,transform .5s var(--ease)}
.topo .wrap{display:flex;align-items:center;justify-content:space-between;gap:14px;height:64px}
.marca{display:flex;align-items:center;gap:10px;font-family:var(--label);font-weight:700;font-size:.78rem;letter-spacing:.2em;color:rgba(255,255,255,.85);text-decoration:none}
.marca img{width:34px;height:34px;border-radius:9px}
.topo .mini{display:inline-flex;align-items:center;gap:8px;font-family:var(--title);font-weight:600;font-size:.88rem;color:#fff;text-decoration:none;padding:9px 16px;border-radius:999px;background:rgba(255,255,255,.1);border:1px solid rgba(255,255,255,.22);transition:background .2s}
.topo .mini:hover{background:var(--coral);border-color:var(--coral)}
.topo .mini svg{width:16px;height:16px;fill:#fff}
.topo.solido{background:rgba(20,20,20,.88);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);box-shadow:0 8px 30px rgba(0,0,0,.25)}

/* hero */
.hero{min-height:100vh;min-height:100svh;display:flex;align-items:center;padding:110px 0 70px;overflow:hidden}
.hero .grid{display:grid;grid-template-columns:minmax(0,1.05fr) minmax(0,.95fr);gap:56px;align-items:center}
.hero h1{margin:22px 0 20px}
.hero .lead{max-width:600px;margin-bottom:32px}
.hero .chips{display:flex;flex-wrap:wrap;gap:10px;margin-top:26px}
.hero .chips span{font-family:var(--label);font-weight:600;font-size:.85rem;letter-spacing:.06em;color:rgba(255,255,255,.75);padding:7px 14px;border-radius:999px;border:1px solid rgba(255,255,255,.14);background:rgba(255,255,255,.04)}
.hero .chips span b{color:var(--coral)}
/* Rômulo grande na abertura (Fernando, 19/11: "e aí, que Rômulo? Quem é esse Rômulo?") */
.hero .palco{display:block;position:relative}
.retrato{position:relative;height:620px;border-radius:30px;overflow:hidden;background:#1a1a1a;border:1px solid rgba(255,255,255,.08);box-shadow:0 40px 90px rgba(0,0,0,.5)}
.retrato .foto{position:absolute;inset:0;background:url("/marca/a5e-hero.webp") 76% 22%/auto 100% no-repeat;transform-origin:72% 28%;animation:kb 18s ease-in-out infinite alternate}
@keyframes kb{to{transform:scale(1.08)}}
.retrato::after{content:"";position:absolute;inset:0;background:linear-gradient(180deg,transparent 50%,rgba(20,20,20,.9) 100%);pointer-events:none}
.retrato .nome{position:absolute;right:24px;bottom:24px;z-index:2;max-width:58%;text-align:right}
.retrato .nome b{display:block;font-family:var(--title);font-weight:700;font-size:1.6rem;line-height:1.1;color:#fff}
.retrato .nome span{display:block;margin-top:6px;font-family:var(--label);font-weight:600;font-size:.8rem;letter-spacing:.1em;text-transform:uppercase;color:rgba(255,255,255,.78);line-height:1.45}
.retrato .nome span i{font-style:normal;color:var(--coral)}
.hero .celular{position:absolute;left:-50px;bottom:-46px;width:270px;z-index:3}
.hero .phone{width:100%;border-radius:36px;padding:9px}
.hero .screen{border-radius:28px}
.hero .wa-head{padding:12px 12px 9px}
.hero .wa-head b{font-size:.86rem}
.hero .m .b{font-size:.74rem}
.hero .halo{right:-34px;top:-30px;bottom:auto;width:80px;height:80px}
.hero .etiqueta{left:14px;transform:none;font-size:.68rem;padding:6px 12px}
.hero .halo img{border-width:5px}
.hero .halo::before{inset:-10px}
.hero .halo::after{width:15px;height:15px;right:4px;bottom:4px;border-width:3px}

/* celular com conversa (como o slide "Max em ação") */
.palco{position:relative;display:flex;justify-content:center}
.phone{position:relative;width:min(100%,380px);aspect-ratio:9/17.5;border-radius:44px;background:#0b0b0b;padding:12px;box-shadow:0 40px 90px rgba(0,0,0,.5),0 0 0 1px rgba(255,255,255,.08)}
.screen{position:relative;width:100%;height:100%;border-radius:33px;overflow:hidden;background:#efeae2;display:flex;flex-direction:column}
.screen::before{content:"";position:absolute;inset:0;opacity:.06;background-image:radial-gradient(#000 1.2px,transparent 1.2px);background-size:20px 20px}
.wa-head{position:relative;z-index:2;display:flex;align-items:center;gap:12px;padding:16px 16px 12px;background:var(--dark);color:#fff}
.wa-head b{font-family:var(--title);font-size:.98rem;display:block;line-height:1.2}
.wa-head span{font-size:.78rem;opacity:.7}
.av{position:relative;flex:none;width:42px;height:42px}
.av img{width:100%;height:100%;border-radius:50%;object-fit:cover}
.av::after{content:"";position:absolute;right:0;bottom:0;width:11px;height:11px;border-radius:50%;background:var(--wa);border:2px solid var(--dark)}
.wa-body{position:relative;z-index:1;flex:1;display:flex;flex-direction:column;justify-content:flex-end;gap:9px;padding:12px 12px 16px;overflow:hidden}
.m{max-width:86%;opacity:0;transform:translateY(14px) scale(.96);transition:opacity .45s var(--ease),transform .55s var(--spring)}
.m.on{opacity:1;transform:none}
.m.out{align-self:flex-end}
.m .b{background:#fff;border-radius:16px 16px 16px 5px;padding:9px 12px 6px;font-size:.84rem;line-height:1.38;color:#222;box-shadow:0 1px 1px rgba(0,0,0,.08)}
.m.out .b{background:#d9fdd3;border-radius:16px 16px 5px 16px}
.m .who{font-family:var(--title);font-weight:600;font-size:.74rem;color:var(--coral);margin-bottom:1px}
.m .who.al{color:var(--teal)}
.m .tm{display:block;text-align:right;font-size:.66rem;color:#8a8a8a;margin-top:2px}
.m ol{margin:4px 0 0 18px} .m li{margin:2px 0}
.typing{align-self:flex-start;display:none;gap:5px;padding:12px 14px;background:#fff;border-radius:16px 16px 16px 5px;box-shadow:0 1px 1px rgba(0,0,0,.08)}
.typing.on{display:flex}
.typing i{width:7px;height:7px;border-radius:50%;background:#9aa;animation:dot 1s infinite}
.typing i:nth-child(2){animation-delay:.15s}.typing i:nth-child(3){animation-delay:.3s}
@keyframes dot{0%,100%{transform:translateY(0);opacity:.5}50%{transform:translateY(-5px);opacity:1}}
.sys{align-self:center;font-family:var(--label);font-weight:600;font-size:.68rem;letter-spacing:.1em;text-transform:uppercase;color:#6b6b6b;background:#fff7d6;border-radius:8px;padding:4px 10px}
.etiqueta{position:absolute;top:-14px;left:50%;transform:translateX(-50%);z-index:3;white-space:nowrap}
/* avatar grande com o anel tracejado girando */
.halo{position:absolute;right:-6px;bottom:8%;z-index:4;width:112px;height:112px}
.halo img{width:100%;height:100%;border-radius:50%;object-fit:cover;border:6px solid var(--dark);box-shadow:0 20px 40px rgba(0,0,0,.45)}
.halo::before{content:"";position:absolute;inset:-14px;border-radius:50%;border:3px dashed rgba(226,61,89,.7);animation:spin 26s linear infinite}
.halo::after{content:"";position:absolute;right:8px;bottom:8px;width:20px;height:20px;border-radius:50%;background:var(--wa);border:4px solid var(--dark)}
@keyframes spin{to{transform:rotate(360deg)}}
.flutua{animation:flutua 6s ease-in-out infinite}
@keyframes flutua{0%,100%{transform:translateY(0)}50%{transform:translateY(-10px)}}

/* 00:03 */
.madrugada .grid{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:56px;align-items:center}
.relogio{font-family:var(--title);font-weight:800;font-size:clamp(4.4rem,15vw,9rem);line-height:.9;letter-spacing:-.04em;color:var(--coral);font-variant-numeric:tabular-nums;display:flex;align-items:baseline;gap:.05em}
.relogio .pisca{animation:pisca 1s steps(2) infinite}
@keyframes pisca{50%{opacity:.2}}
.madrugada h2{margin-top:20px}
.madrugada h2 .vira{display:block;color:var(--coral);opacity:0;transform:translateY(20px);transition:opacity .8s var(--ease) .2s,transform .8s var(--ease) .2s}
.madrugada.virou h2 .vira{opacity:1;transform:none}
.notif{display:flex;gap:14px;align-items:center;margin-top:30px;padding:16px 20px;border-radius:18px;background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.14);max-width:520px;font-size:.98rem;color:rgba(255,255,255,.88)}
.notif b{display:block;font-family:var(--label);font-size:.75rem;letter-spacing:.14em;text-transform:uppercase;color:var(--teal-light);margin-bottom:2px}
.notif .ap{font-size:1.8rem}
.madrugada .phone{aspect-ratio:auto;height:auto}
.madrugada .screen{height:auto;min-height:520px}

/* raio-x do anúncio */
.raio .grid{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:56px;align-items:center;margin-top:46px}
.anuncio{position:relative;background:#fff;border-radius:24px;box-shadow:0 30px 70px rgba(17,24,39,.12);border:1px solid var(--line);padding:14px;overflow:hidden}
.fotos{display:grid;grid-template-columns:2fr 1fr 1fr;grid-template-rows:1fr 1fr;gap:6px;height:clamp(180px,32vw,250px);border-radius:16px;overflow:hidden}
.fotos div{position:relative;background:linear-gradient(135deg,#d9dee3,#c3ccd3)}
.fotos div:first-child{grid-row:span 2;background:linear-gradient(135deg,#b9c4cc,#9fb0bb)}
.fotos div::after{content:attr(data-c);position:absolute;left:8px;bottom:7px;font-family:var(--label);font-weight:600;font-size:.7rem;letter-spacing:.08em;text-transform:uppercase;color:rgba(255,255,255,.95);text-shadow:0 1px 3px rgba(0,0,0,.35)}
.fotos svg{position:absolute;left:50%;top:50%;width:34%;max-width:56px;transform:translate(-50%,-50%);opacity:.55}
.anuncio .info{padding:14px 6px 4px}
.anuncio .tit{font-family:var(--title);font-weight:600;font-size:1.05rem}
.anuncio .meta{display:flex;justify-content:space-between;align-items:center;margin-top:6px;font-size:.92rem;color:var(--muted)}
.anuncio .meta b{color:var(--ink);font-family:var(--title)}
.feixe{position:absolute;left:0;right:0;top:-30%;height:30%;background:linear-gradient(180deg,transparent,rgba(42,137,149,.18) 70%,rgba(42,137,149,.55));border-bottom:2px solid var(--teal-2);opacity:0;pointer-events:none}
.raio.on .feixe{animation:varre 2.6s var(--ease) .3s 2 forwards}
@keyframes varre{0%{top:-30%;opacity:1}85%{opacity:1}100%{top:100%;opacity:0}}
.marca-x{display:flex;align-items:center;gap:9px;padding:9px 12px;border-radius:12px;background:var(--dark);color:#fff;font-size:.82rem;line-height:1.3;box-shadow:0 12px 26px rgba(0,0,0,.18);opacity:0;transform:translateX(-14px) scale(.9);transform-origin:left center;transition:opacity .45s var(--ease),transform .6s var(--spring)}
.marca-x i{flex:none;width:22px;height:22px;border-radius:50%;background:var(--coral);display:grid;place-items:center;font-style:normal;font-family:var(--title);font-weight:700;font-size:.72rem}
.marca-x.ok i{background:var(--teal)}
.raio.on .marca-x{opacity:1;transform:none}
.mx1{position:absolute;z-index:3;left:24px;top:24px;max-width:58%;transition-delay:1.2s}
.achados{display:flex;flex-direction:column;gap:8px;padding:12px 4px 4px;border-top:1px dashed var(--line-2);margin-top:12px}
.mx2{transition-delay:2s} .mx3{transition-delay:2.8s} .mx4{transition-delay:3.6s}
.exemplo{font-family:var(--label);font-size:.78rem;letter-spacing:.08em;color:var(--muted);margin-top:12px;text-align:center}
.pernas{display:flex;flex-direction:column;gap:16px}
.perna{display:flex;gap:18px;align-items:flex-start;padding:22px 24px;border-radius:20px;background:#fff;box-shadow:var(--shadow);border:1px solid var(--line);border-left:6px solid var(--coral)}
.perna:nth-child(2){border-left-color:var(--teal)} .perna:nth-child(3){border-left-color:var(--dark)}
.perna .n{font-family:var(--title);font-weight:800;font-size:2.2rem;line-height:1;color:var(--coral);min-width:34px}
.perna:nth-child(2) .n{color:var(--teal)} .perna:nth-child(3) .n{color:var(--dark)}
.perna p{color:var(--ink-2);font-size:.98rem;margin-top:6px}

/* mesinha de 3 pernas */
.mesa{background:#fff;overflow:hidden}
.mesa .grid{display:grid;grid-template-columns:minmax(0,1.1fr) minmax(0,.9fr);gap:40px;align-items:center;margin-top:30px}
.mesa-svg{width:100%;height:auto;overflow:visible}
.mesa-svg .tudo{transform-box:view-box;transform-origin:300px 380px;opacity:0;transform:translateY(-120px) scale(.94);transition:opacity .45s,transform 1s cubic-bezier(.34,1.45,.64,1)}
.mesa.s1 .mesa-svg .tudo{opacity:1;transform:none}
.mesa-svg .sombra{opacity:0;transform-box:fill-box;transform-origin:center;transform:scale(.5);transition:opacity .6s .35s,transform .9s .35s var(--ease)}
.mesa.s1 .mesa-svg .sombra{opacity:1;transform:none}
.mesa-svg .grp{transform-box:view-box;transform-origin:128px 382px;transition:transform 1.1s cubic-bezier(.55,0,.85,.35)}
.mesa-svg .lg{fill:#5b5b5b;transition:fill .4s}
.mesa-svg .lg.atras{fill:#444}
.mesa.s2:not(.s5) .leg1 .lg,.mesa.s3:not(.s5) .leg2 .lg,.mesa.s4:not(.s5) .leg3 .lg{fill:var(--coral)}
.mesa-svg .bd{opacity:0;transform-box:fill-box;transform-origin:center;transform:scale(.4);transition:opacity .35s .15s,transform .5s .15s var(--spring)}
.mesa.s2 .bd1,.mesa.s3 .bd2,.mesa.s4 .bd3{opacity:1;transform:none}
.mesa.s5:not(.s6) .bd{opacity:0;transform:scale(.4);transition:opacity .25s,transform .25s}
.mesa-svg .leg3{transform-box:view-box;transform-origin:472px 382px;transition:transform .6s var(--ease),opacity .4s}
.mesa.s5:not(.s6) .leg3{transform:translateY(200px) rotate(12deg);opacity:0;transition:transform .7s cubic-bezier(.5,0,.9,.4),opacity .5s .25s}
.mesa.s5:not(.s6) .grp{transform:rotate(24deg)}
.mesa-svg .coisa{transform-box:view-box;transition:transform 1.2s cubic-bezier(.5,0,.9,.4) .35s,opacity .6s .9s}
.mesa.s5:not(.s6) .coisa{transform:translate(260px,330px) rotate(80deg);opacity:0}
.mesa-svg .brilho{opacity:0;transition:opacity .8s .4s}
.mesa.s4 .brilho{opacity:1}
.mesa.s5:not(.s6) .brilho{opacity:0;transition:opacity .2s}
.mesa .tremor{transform-box:view-box;transform-origin:300px 380px}
.mesa.s5:not(.s6) .tremor{animation:baque .5s 1.05s}
@keyframes baque{0%,100%{transform:none}30%{transform:translateY(7px)}60%{transform:translateY(-3px)}}
.mesa-cartoes{display:flex;flex-direction:column;gap:14px}
.lcard{padding:18px 22px;border-radius:18px;background:#fff;box-shadow:var(--shadow);border:1px solid var(--line);border-left:7px solid var(--line-2);opacity:.35;transform:translateX(20px);transition:opacity .6s var(--ease),transform .7s var(--ease),border-color .4s}
.lcard p{color:var(--ink-2);font-size:.95rem;margin-top:4px}
.mesa.s2 .lc1,.mesa.s3 .lc2,.mesa.s4 .lc3{opacity:1;transform:none;border-left-color:var(--coral)}
.mesa.s5:not(.s6) .lc3{opacity:.5;border-left-color:#bbb}
.mesa.s5:not(.s6) .lc3 h3{text-decoration:line-through;text-decoration-color:var(--coral);text-decoration-thickness:3px}
.frase-mesa{font-family:var(--title);font-weight:700;font-size:clamp(1.3rem,3.4vw,1.9rem);min-height:2.6em;margin-top:22px;color:var(--ink)}
.frase-mesa span{display:none}
.mesa:not(.s5) .frase-mesa .f1{display:inline}
.mesa.s5:not(.s6) .frase-mesa .f2{display:inline;color:var(--coral)}
.mesa.s6 .frase-mesa .f3{display:inline;color:var(--teal)}
.mesa.s6 .lcard{opacity:1;transform:none;border-left-color:var(--teal)}
.mesa-selo{opacity:0;transform:scale(.5);transform-box:fill-box;transform-origin:center;transition:opacity .4s,transform .6s var(--spring)}
.mesa.s6 .mesa-selo{opacity:1;transform:none}
.denovo{margin-top:16px;font-family:var(--label);font-weight:700;font-size:.82rem;letter-spacing:.12em;text-transform:uppercase;color:var(--teal);background:none;border:1px dashed var(--teal-light);border-radius:999px;padding:8px 16px;cursor:pointer;opacity:0;transition:opacity .4s}
.mesa.s6 .denovo{opacity:1}

/* selos */
.selos{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:18px;margin-top:46px}
.selo{display:flex;flex-direction:column;align-items:center;text-align:center;padding:30px 18px 28px;border-radius:24px;background:#fff;box-shadow:var(--shadow);border:1px solid var(--line)}
.selo .disc{width:84px;height:84px;border-radius:50%;background:var(--coral);display:grid;place-items:center;box-shadow:0 0 0 10px var(--coral-wash);margin-bottom:24px;transition:transform .5s var(--spring)}
.selo:hover .disc{transform:rotate(-8deg) scale(1.06)}
.selo.t .disc{background:var(--teal);box-shadow:0 0 0 10px var(--teal-wash)}
.selo.d .disc{background:var(--dark);box-shadow:0 0 0 10px #ececec}
.selo .disc svg{width:40px;height:40px}
.selo b{font-family:var(--title);font-weight:700;font-size:1.05rem;line-height:1.2;color:var(--ink)}
.selo span{font-family:var(--label);font-size:.9rem;color:var(--muted);margin-top:8px}

/* depoimentos */
.depos{display:grid;grid-template-columns:1.25fr 1fr 1fr;gap:20px;margin-top:40px}
.depo{position:relative;padding:28px 28px 24px;border-radius:24px 24px 24px 8px;background:#fff;box-shadow:var(--shadow);border:1px solid var(--line);display:flex;flex-direction:column;justify-content:space-between;gap:18px}
.depo q{display:block;font-weight:600;font-size:1.02rem;line-height:1.5;color:var(--ink);quotes:none;position:relative}
.depo q b{color:var(--coral)}
.depo .by{display:flex;align-items:center;gap:10px;font-family:var(--label);font-weight:700;font-size:.8rem;letter-spacing:.14em;text-transform:uppercase;color:var(--teal)}
.depo .by::before{content:"";width:28px;height:3px;background:var(--coral);border-radius:2px}
.depo.big{grid-row:span 2;background:var(--coral);border-color:var(--coral);box-shadow:var(--shadow-coral)}
.depo.big q{color:#fff;font-size:1.3rem}.depo.big q b{color:#fff;background:rgba(0,0,0,.18);padding:0 6px;border-radius:6px}
.depo.big .by{color:#fff}.depo.big .by::before{background:#fff}
.depo .aspas{position:absolute;right:20px;top:2px;font-family:var(--title);font-size:5rem;line-height:1;color:var(--coral-wash)}
.depo.big .aspas{color:rgba(255,255,255,.22)}

/* rômulo */
.romulo{background:var(--dark) url("/marca/a5e-hero.webp") 78% center/cover no-repeat;overflow:hidden}
.romulo::before{content:"";position:absolute;inset:0;background:linear-gradient(90deg,rgba(20,20,20,.96) 0%,rgba(20,20,20,.86) 48%,rgba(20,20,20,.25) 80%,rgba(20,20,20,.1) 100%)}
.romulo .wrap{position:relative}
.romulo .txt{max-width:640px}
.linha{display:flex;flex-direction:column;gap:14px;margin-top:34px}
.tl{display:flex;gap:20px;align-items:center;padding:18px 22px;border-radius:18px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.12)}
.tl .y{font-family:var(--title);font-weight:700;font-size:1.6rem;color:var(--coral);min-width:84px}
.tl .x{font-family:var(--title);font-weight:600;font-size:1.05rem;line-height:1.3}
.stats{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin-top:26px}
.stat{padding:18px 14px;border-radius:16px;background:var(--dark-2);border:1px solid rgba(255,255,255,.08)}
.stat .n{font-family:var(--title);font-weight:700;font-size:clamp(1.5rem,4vw,2.1rem);line-height:1;color:#fff}
.stat .n small{font-size:.6em;color:var(--coral)}
.stat .l{font-family:var(--label);font-size:.74rem;letter-spacing:.14em;text-transform:uppercase;opacity:.7;margin-top:8px}

/* preço */
.preco{text-align:center;overflow:hidden}
.preco h2{margin:14px auto 34px;max-width:760px}
.cartao{position:relative;max-width:540px;margin:0 auto;padding:40px 30px 34px;border-radius:28px;background:#232323;border:1px solid rgba(255,255,255,.1);box-shadow:0 30px 80px rgba(0,0,0,.4)}
.cartao::before{content:"";position:absolute;inset:-1px;border-radius:inherit;padding:1px;background:conic-gradient(from var(--ang,0deg),transparent 0 60%,var(--coral) 75%,var(--teal-2) 85%,transparent 100%);-webkit-mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);-webkit-mask-composite:xor;mask-composite:exclude;animation:borda 6s linear infinite;pointer-events:none}
@property --ang{syntax:"<angle>";initial-value:0deg;inherits:false}
@keyframes borda{to{--ang:360deg}}
.cartao .gratis{display:inline-block;font-family:var(--label);font-weight:700;font-size:.82rem;letter-spacing:.14em;text-transform:uppercase;color:#fff;background:var(--teal);padding:6px 14px;border-radius:999px;margin-bottom:18px}
.cartao .vezes{font-family:var(--title);font-weight:600;font-size:1.15rem;color:#d6d6d6}
.cartao .big{font-family:var(--title);font-weight:800;font-size:clamp(3.2rem,12vw,4.6rem);line-height:1;color:#fff;margin-top:4px;letter-spacing:-.03em}
.cartao .big small{font-size:1.15rem;font-weight:600;color:#bdbdbd;letter-spacing:0}
.cartao .sub{color:#a9a9a9;font-size:.95rem;margin:12px 0 26px}
.cartao ul{list-style:none;text-align:left;margin:0 auto 30px;display:grid;gap:10px;color:#e6e6e6;max-width:380px}
.cartao li{display:flex;gap:10px;align-items:flex-start}
.cartao li::before{content:"✓";flex:none;width:22px;height:22px;border-radius:50%;background:rgba(226,61,89,.18);color:var(--coral);font-weight:700;font-size:.8rem;display:grid;place-items:center;margin-top:2px}

/* perguntas */
.faq{max-width:760px;margin:40px auto 0;display:grid;gap:12px}
.faq details{background:#fff;border-radius:18px;border:1px solid var(--line);box-shadow:var(--shadow);padding:4px 22px}
.faq summary{cursor:pointer;list-style:none;font-family:var(--title);font-weight:600;font-size:1.05rem;padding:16px 30px 16px 0;position:relative}
.faq summary::-webkit-details-marker{display:none}
.faq summary::after{content:"+";position:absolute;right:0;top:50%;transform:translateY(-50%);font-size:1.6rem;color:var(--coral);transition:transform .3s var(--ease)}
.faq details[open] summary::after{transform:translateY(-50%) rotate(45deg)}
.faq details p{color:var(--ink-2);padding:0 0 18px}

/* final */
.final{text-align:center}
.final .av-final{position:relative;width:120px;height:120px;margin:0 auto 30px}
.final .av-final img{width:100%;height:100%;border-radius:50%;object-fit:cover;border:6px solid #fff;box-shadow:0 20px 40px rgba(0,0,0,.15)}
.final .av-final::before{content:"";position:absolute;inset:-14px;border-radius:50%;border:3px dashed rgba(226,61,89,.55);animation:spin 26s linear infinite}
.final h2{max-width:760px;margin:0 auto 16px}
.final .lead{max-width:560px;margin:0 auto 32px}
footer{background:var(--dark-2);color:#8a8a8a;text-align:center;padding:30px 20px 110px;font-size:.85rem}

/* barra fixa no celular */
.barra{position:fixed;left:12px;right:12px;bottom:12px;z-index:60;display:none;transform:translateY(140%);transition:transform .5s var(--ease)}
.barra .cta{width:100%;padding:16px 20px}
.barra.on{transform:none}

@media (max-width:980px){
  .selos{grid-template-columns:repeat(2,minmax(0,1fr))}
  .selos .selo:last-child{grid-column:span 2}
  .depos{grid-template-columns:1fr 1fr}
  .depo.big{grid-column:span 2;grid-row:auto}
}
@media (max-width:860px){
  .hero{padding-top:96px}
  .hero .grid,.madrugada .grid,.raio .grid,.mesa .grid{grid-template-columns:minmax(0,1fr);gap:44px}
  .hero .txt{text-align:left}
  .palco{margin-top:4px}
  .rv.dir,.rv.esq{transform:translateY(34px)}
  .hero{padding-top:84px}
  .hero .grid{display:flex;flex-direction:column;align-items:stretch;gap:28px}
  .hero .palco{display:contents}
  .retrato{order:-1;height:min(80vw,340px);border-radius:24px}
  .retrato .foto{background-position:70% 18%}
  .retrato .nome{right:auto;left:18px;bottom:18px;text-align:left;max-width:62%}
  .retrato .nome b{font-size:1.3rem}
  .retrato .nome span{font-size:.7rem}
  .hero .celular{position:relative;left:auto;bottom:auto;width:min(100%,340px);margin:6px auto 0}
  .hero .m .b{font-size:.84rem}
  .hero .halo{width:64px;height:64px;right:-8px;top:-26px}
  .halo::before{inset:-9px}
  .halo::after{width:14px;height:14px;right:2px;bottom:2px;border-width:3px}
  .stats{grid-template-columns:repeat(2,minmax(0,1fr))}
  .romulo{background-position:70% top;background-size:auto 60%;padding-top:58vw}
  .romulo::before{background:linear-gradient(180deg,rgba(20,20,20,.1) 0%,rgba(20,20,20,.75) 30%,rgba(20,20,20,.97) 46%)}
  .barra{display:block}
  .topo .mini span{display:none}
}
@media (max-width:560px){
  .depos{grid-template-columns:1fr}
  .depo.big{grid-column:auto}
  .selos{grid-template-columns:1fr}
  .selos .selo:last-child{grid-column:auto}
  .selo{flex-direction:row;text-align:left;gap:18px;padding:20px}
  .selo .disc{width:60px;height:60px;margin:0;flex:none;box-shadow:0 0 0 7px var(--coral-wash)}
  .selo.t .disc{box-shadow:0 0 0 7px var(--teal-wash)} .selo.d .disc{box-shadow:0 0 0 7px #ececec}
  .selo .disc svg{width:28px;height:28px}
  .selo div{display:flex;flex-direction:column}
  .cta{width:100%}
  .marca span{display:none}
}
@media (prefers-reduced-motion:reduce){
  *,*::before,*::after{animation:none!important;transition:none!important}
  .rv,.m,.marca-x,.lcard{opacity:1!important;transform:none!important;filter:none!important}
}
</style>
<script>!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');fbq('init',${JSON.stringify(pixel)});fbq('track','PageView');</script>
</head>
<body>

<header class="topo" id="topo">
  <div class="wrap">
    <a class="marca" href="#inicio"><img src="/marca/cda-icone.png" alt="" width="34" height="34"><span>CANAL DO ANFITRIÃO</span></a>
    <a class="mini" href="${link}" target="_blank" rel="noopener" data-cta>${WA_ICON}<span>Falar com o Max</span></a>
  </div>
</header>

<!-- HERO -->
<section class="hero dark glow" id="inicio">
  <div class="wrap grid">
    <div class="txt">
      <span class="pill coral rv">🎁 Análise grátis do seu anúncio</span>
      <h1 class="rv" style="--d:.1s">O Rômulo no seu bolso, <span class="c">24 horas</span>.</h1>
      <p class="lead rv" style="--d:.2s">O Max é o concierge com IA do Rômulo Villela. Ele estudou todas as aulas do Rômulo e as regras do Airbnb e do Booking, lê o seu anúncio e te diz o que mudar pra ter mais reservas.</p>
      <div class="rv" style="--d:.3s">${cta("Pegar minha análise grátis")}</div>
      <p class="nota rv" style="--d:.35s">Grátis. Sem cadastro e sem formulário: é só mandar um oi no WhatsApp.</p>
      <div class="chips rv" style="--d:.45s"><span><b>✓</b> Fotos e capa</span><span><b>✓</b> Título e descrição</span><span><b>✓</b> Preço e regras</span></div>
    </div>
    <div class="palco">
      <div class="retrato rv pop" style="--d:.15s" role="img" aria-label="Rômulo Villela">
        <div class="foto"></div>
        <div class="nome"><b>Rômulo Villela</b><span>Anfitrião desde 2016<br><i>60+ imóveis</i> · 1.700+ alunos</span></div>
      </div>
      <div class="celular rv" style="--d:.45s">
      <div class="phone flutua">
        <span class="pill etiqueta">Exemplo de análise</span>
        <div class="screen">
          <div class="wa-head"><span class="av"><img src="/max/avatar.jpg" alt="Max"></span><div><b>Max, o Concierge</b><span>online</span></div></div>
          <div class="wa-body" data-chat="hero">
            <div class="m out" data-p="600"><div class="b">${attr(mensagem)}<span class="tm">21:07</span></div></div>
            <div class="m" data-p="1100" data-max><div class="b"><div class="who">Max, o Concierge</div>Oi! Que bom que você veio 🏡 Me manda o link do seu anúncio no Airbnb que eu faço a análise agora.<span class="tm">21:07</span></div></div>
            <div class="m out" data-p="1300"><div class="b">airbnb.com.br/rooms/…<span class="tm">21:08</span></div></div>
            <div class="m" data-p="1800" data-max><div class="b"><div class="who">Max, o Concierge</div>Olhei tudo! Os 3 pontos que mais pesam:<ol><li>A capa é o banheiro: troca pela sala com a varanda.</li><li>O título não fala da vista, que é o seu diferencial.</li><li>No fim de semana, a sua diária está abaixo dos vizinhos.</li></ol><span class="tm">21:08</span></div></div>
            <div class="typing"><i></i><i></i><i></i></div>
          </div>
        </div>
      </div>
      <div class="halo"><img src="/max/avatar.jpg" alt=""></div>
      </div>
    </div>
  </div>
</section>

<!-- 00:03 -->
<section class="madrugada dark" id="madrugada">
  <div class="wrap grid">
    <div>
      <span class="pill rv">Conversa real · grupo de membros · 09/11</span>
      <div class="relogio rv" style="--d:.1s" aria-label="meia-noite e três"><span data-h>23</span><span class="pisca">:</span><span data-mi>33</span></div>
      <h2 class="rv" style="--d:.2s">Meia-noite. Ninguém respondia.<span class="vira">O Max, em 8 segundos.</span></h2>
      <div class="notif rv" style="--d:.3s"><span class="ap">🏡</span><div><b>Hóspede chegando</b>Dúvida no anúncio, na plataforma ou no preço, a qualquer hora. Quem responde é o Max.</div></div>
    </div>
    <div class="palco rv dir" style="--d:.15s">
      <div class="phone">
        <div class="screen">
          <div class="wa-head"><span class="av"><img src="/max/avatar.jpg" alt="Max"></span><div><b>Membros · Anfitriões 5⭐</b><span>Max, o Concierge, online</span></div></div>
          <div class="wa-body" data-chat="madrugada">
            <div class="m" data-p="400"><div class="b"><div class="who al">Aluna</div>gente, no booking dá pra colocar os 20% do co-anfitrião?<span class="tm">23:33</span></div></div>
            <div class="sys m" data-p="900">30 minutos sem resposta</div>
            <div class="m" data-p="900" data-hora="00:03"><div class="b"><div class="who al">Aluna</div>alguém sabe??<span class="tm">00:03</span></div></div>
            <div class="m" data-p="900" data-max data-virou><div class="b"><div class="who">Max, o Concierge</div>No Booking não tem essa função. Lá não existe divisão automática de repasse pro co-anfitrião como no Airbnb: o pagamento cai todo na conta bancária cadastrada na propriedade.<br><br>O jeito é receber o valor e repassar os 20% por fora, por Pix ou transferência, com um contrato simples entre vocês dizendo a porcentagem e quando o repasse é feito 🏡<span class="tm">00:03</span></div></div>
            <div class="m" data-p="900"><div class="b"><div class="who al">Aluna</div>obrigada<span class="tm">00:04</span></div></div>
            <div class="typing"><i></i><i></i><i></i></div>
          </div>
        </div>
      </div>
    </div>
  </div>
</section>

<!-- RAIO-X -->
<section class="raio" id="raio">
  <div class="wrap">
    <span class="label rv">A análise grátis</span>
    <h2 class="rv" style="--d:.1s;margin-top:10px">O raio-x do seu anúncio, <span class="c">em minutos</span>.</h2>
    <p class="lead rv" style="--d:.2s;max-width:700px;margin-top:16px">Você manda o link, o Max lê o anúncio inteiro e volta com o que mudar primeiro. Tudo com o método do Rômulo: a mesinha de 3 pernas.</p>
    <div class="grid">
      <div class="rv pop" style="--d:.15s">
        <div class="anuncio">
          <div class="fotos">
            <div data-c="capa: banheiro"><svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="1.6"><path d="M4 12h16v3a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4z"/><path d="M6 12V6a2 2 0 0 1 4 0"/></svg></div>
            <div data-c="sala"><svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="1.6"><path d="M3 18v-5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v5M3 18h18M6 11V8h12v3"/></svg></div>
            <div data-c="quarto"><svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="1.6"><path d="M3 19v-8h18v8M3 15h18M7 11V8h4v3"/></svg></div>
            <div data-c="varanda"><svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="1.6"><circle cx="12" cy="9" r="4"/><path d="M3 20h18M6 20v-5M12 20v-5M18 20v-5"/></svg></div>
            <div data-c="cozinha"><svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="1.6"><rect x="5" y="3" width="14" height="18" rx="2"/><path d="M5 10h14M9 6v2M9 13v3"/></svg></div>
          </div>
          <div class="info">
            <div class="tit">Apartamento aconchegante no centro</div>
            <div class="meta"><span>★ 4,7 · 38 avaliações</span><span><b>R$ 280</b> / noite</span></div>
          </div>
          <div class="achados">
            <div class="marca-x mx2"><i>2</i>O título não diz o diferencial: a vista da varanda.</div>
            <div class="marca-x mx3"><i>3</i>Sábado e domingo abaixo da diária dos vizinhos.</div>
            <div class="marca-x mx4 ok"><i>✓</i>Check-in e regras da casa claros.</div>
          </div>
          <div class="feixe"></div>
          <div class="marca-x mx1"><i>1</i>A capa é o banheiro: troque pela sala com a varanda.</div>
        </div>
        <p class="exemplo">Ilustração. O Max analisa o seu anúncio de verdade, pelo link.</p>
      </div>
      <div class="pernas">
        <div class="perna rv dir" style="--d:.1s"><span class="n">1</span><div><h3>Anúncio que converte</h3><p>Fotos e capa, ordem do mosaico, foto que a plataforma corta, título e descrição que vendem o seu diferencial.</p></div></div>
        <div class="perna rv dir" style="--d:.2s"><span class="n">2</span><div><h3>Queridinho do algoritmo</h3><p>Diária comparada com a região, fim de semana, taxa de limpeza, calendário e regras da casa.</p></div></div>
        <div class="perna rv dir" style="--d:.3s"><span class="n">3</span><div><h3>Experiência 5 estrelas</h3><p>Comodidades, mensagens pro hóspede, check-in sem estresse e o que pesa nas avaliações.</p></div></div>
      </div>
    </div>
  </div>
</section>

<!-- MESINHA -->
<section class="mesa" id="mesa">
  <div class="wrap">
    <span class="label rv">O método do Rômulo</span>
    <h2 class="rv" style="--d:.1s;margin-top:10px">A mesinha de <span class="c">3 pernas</span>.</h2>
    <div class="grid">
      <div>
        <svg class="mesa-svg" viewBox="0 0 600 430" role="img" aria-label="Uma mesa de três pernas: anúncio que converte, queridinho do algoritmo e experiência 5 estrelas">
          <defs>
            <linearGradient id="tampo" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#3aa3b0"/><stop offset="1" stop-color="#24757f"/></linearGradient>
            <linearGradient id="borda" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#1d5f67"/><stop offset=".5" stop-color="#24757f"/><stop offset="1" stop-color="#174e55"/></linearGradient>
            <radialGradient id="luz" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="rgba(226,61,89,.35)"/><stop offset="1" stop-color="rgba(226,61,89,0)"/></radialGradient>
          </defs>
          <ellipse class="sombra" cx="300" cy="392" rx="215" ry="16" fill="rgba(0,0,0,.12)"/>
          <ellipse class="brilho" cx="300" cy="150" rx="290" ry="120" fill="url(#luz)"/>
          <g class="tudo"><g class="tremor"><g class="grp">
            <g class="leg2"><path class="lg atras" d="M292 160h16l-3 175h-10z"/></g>
            <g class="leg1"><path class="lg" d="M120 170h18l-4 212h-10z"/></g>
            <g class="leg3"><path class="lg" d="M462 170h18l-4 212h-10z"/></g>
            <ellipse cx="300" cy="166" rx="240" ry="54" fill="url(#borda)"/>
            <ellipse cx="300" cy="152" rx="240" ry="54" fill="url(#tampo)"/>
            <ellipse cx="300" cy="148" rx="226" ry="46" fill="none" stroke="rgba(255,255,255,.25)" stroke-width="2"/>
            <g class="coisa">
              <path d="M262 132l38-30 38 30v26h-76z" fill="#fff"/><path d="M252 134l48-40 48 40" fill="none" stroke="#e23d59" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>
              <rect x="290" y="132" width="20" height="26" rx="3" fill="#e23d59"/>
              <text x="300" y="88" text-anchor="middle" font-size="18" fill="#f2b705">★★★★★</text>
            </g>
          </g></g></g>
          <g class="bd bd1"><circle cx="129" cy="300" r="22" fill="#fff" stroke="#e23d59" stroke-width="4"/><text x="129" y="311" text-anchor="middle" font-family="Poppins" font-weight="700" font-size="26" fill="#e23d59">1</text></g>
          <g class="bd bd2"><circle cx="300" cy="270" r="22" fill="#fff" stroke="#e23d59" stroke-width="4"/><text x="300" y="281" text-anchor="middle" font-family="Poppins" font-weight="700" font-size="26" fill="#e23d59">2</text></g>
          <g class="bd bd3"><circle cx="471" cy="300" r="22" fill="#fff" stroke="#e23d59" stroke-width="4"/><text x="471" y="311" text-anchor="middle" font-family="Poppins" font-weight="700" font-size="26" fill="#e23d59">3</text></g>
          <g class="mesa-selo"><circle cx="540" cy="70" r="44" fill="#24757f"/><path d="M520 70l14 14 26-28" fill="none" stroke="#fff" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/></g>
        </svg>
      </div>
      <div>
        <div class="mesa-cartoes">
          <div class="lcard lc1"><h3>1 · Anúncio que converte</h3><p>O hóspede clica e reserva.</p></div>
          <div class="lcard lc2"><h3>2 · Queridinho do algoritmo</h3><p>A plataforma te mostra pra mais gente.</p></div>
          <div class="lcard lc3"><h3>3 · Experiência 5 estrelas</h3><p>Avaliação boa traz a próxima reserva.</p></div>
        </div>
        <div class="frase-mesa" aria-live="polite"><span class="f1">Uma perna puxa a outra: é o ciclo virtuoso.</span><span class="f2">Uma perna falha, a mesa cai.</span><span class="f3">O Max confere as três no seu anúncio.</span></div>
        <button class="denovo" type="button" data-denovo>↻ ver de novo</button>
      </div>
    </div>
  </div>
</section>

<!-- SELOS -->
<section id="concierge">
  <div class="wrap">
    <span class="label rv">Depois da análise</span>
    <h2 class="rv" style="--d:.1s;margin-top:10px">Seu concierge, <span class="c">24 horas</span>.</h2>
    <p class="lead rv" style="--d:.2s;max-width:680px;margin-top:16px">Aquela dúvida às 23h, com hóspede esperando e ninguém pra perguntar? O Max responde em segundos, de dia, de noite e no fim de semana.</p>
    <div class="selos">
      <div class="selo rv pop" style="--d:.05s"><div class="disc"><svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2L4 14h7l-1 8 9-12h-7z"/></svg></div><div><b>Responde em segundos</b><span>de dia, de noite, no fim de semana</span></div></div>
      <div class="selo t rv pop" style="--d:.15s"><div class="disc"><svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="13" rx="2"/><path d="M10 8.5v5l4-2.5z" fill="#fff"/><path d="M8 21h8"/></svg></div><div><b>Sabe todas as aulas</b><span>do Rômulo e as regras do Airbnb e do Booking</span></div></div>
      <div class="selo d rv pop" style="--d:.25s"><div class="disc"><svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg></div><div><b>Faz o raio-x</b><span>de todos os seus anúncios</span></div></div>
      <div class="selo rv pop" style="--d:.35s"><div class="disc"><svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.4 8.4 0 0 1-12.4 7.4L3 21l2.1-5.4A8.5 8.5 0 1 1 21 11.5z"/></svg></div><div><b>Escreve as mensagens</b><span>boas-vindas, check-in e resposta a avaliação ruim</span></div></div>
      <div class="selo t rv pop" style="--d:.45s"><div class="disc"><svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 17l6-6 4 4 8-8"/><path d="M15 7h6v6"/></svg></div><div><b>Te ajuda no preço</b><span>e no PriceLabs, data por data</span></div></div>
    </div>
  </div>
</section>

<!-- DEPOIMENTOS -->
<section style="background:#fff" id="depoimentos">
  <div class="wrap">
    <span class="pill rv">Alunos sobre o Max · novembro</span>
    <h2 class="rv" style="--d:.1s;margin-top:18px">“Fiquei <span class="c">estupefata</span>.”</h2>
    <div class="depos">
      <div class="depo big rv pop" style="--d:.05s"><span class="aspas">“</span><q>Ontem de madrugada coloquei o Max pra trabalhar no meu pv, e confesso que fiquei <b>ESTUPEFATA</b> com a precisão e funcionalidade dele. Ele reajustou todo o meu anúncio, precificou, viu fotos. (…) De ontem pra hoje, já acordei com uma reserva feita.</q><div class="by">Juliana · 11/11</div></div>
      <div class="depo rv pop" style="--d:.15s"><span class="aspas">“</span><q>Passei a tarde conversando com Max e ajustando preços, descrições, políticas para janeiro… Acabo de chegar em casa e recebo uma <b>super reserva</b>!!!</q><div class="by">Isis · 11/11</div></div>
      <div class="depo rv pop" style="--d:.25s"><span class="aspas">“</span><q>Passei meus anúncios para o Max e foi muito boa a análise, <b>ajudou bastante</b>.</q><div class="by">Helen · 10/11</div></div>
      <div class="depo rv pop" style="--d:.35s"><span class="aspas">“</span><q>O Max é um <b>fenômeno</b>… 6 dias que eu comprei o curso (…) assinei meu primeiro contrato como Coanfitriã 🎉</q><div class="by">Francielle · 12/11</div></div>
      <div class="depo rv pop" style="--d:.45s"><span class="aspas">“</span><q>Adiciona ele e bate papo no privado. Ele é <b>FANTÁSTICO</b></q><div class="by">Katia · 12/11</div></div>
    </div>
  </div>
</section>

<!-- RÔMULO -->
<section class="romulo dark" id="romulo">
  <div class="wrap">
    <div class="txt">
      <span class="pill rv">Quem está por trás</span>
      <h2 class="rv" style="--d:.1s;margin-top:18px">O método do <span class="c">Rômulo Villela</span>, no seu WhatsApp.</h2>
      <div class="linha">
        <div class="tl rv esq" style="--d:.15s"><div class="y">2016</div><div class="x">Um quarto no Airbnb pra ajudar no aluguel</div></div>
        <div class="tl rv esq" style="--d:.25s"><div class="y">Hoje</div><div class="x">Mais de <span class="c">60 imóveis</span> sob gestão</div></div>
      </div>
      <div class="stats rv" style="--d:.35s">
        <div class="stat"><div class="n"><span data-conta="10">10</span><small>+</small></div><div class="l">anos</div></div>
        <div class="stat"><div class="n"><span data-conta="11">11</span><small> mil+</small></div><div class="l">locações</div></div>
        <div class="stat"><div class="n"><span data-conta="1700">1.700</span><small>+</small></div><div class="l">alunos</div></div>
        <div class="stat"><div class="n"><span data-conta="6">6</span><small>M+</small></div><div class="l">views</div></div>
      </div>
    </div>
  </div>
</section>

<!-- PREÇO -->
<section class="preco dark glow" id="preco">
  <div class="wrap">
    <span class="label rv" style="color:var(--teal-light)">Gostou da análise?</span>
    <h2 class="rv" style="--d:.1s">Tenha o Max com você <span class="c">o ano inteiro</span>.</h2>
    <div class="cartao rv pop" style="--d:.2s">
      <span class="gratis">Primeiro, a análise grátis</span>
      <div class="sub" style="margin-top:4px">Depois da análise, se fizer sentido, o Max te mostra como ter ele com você o ano inteiro.</div>
      <ul>
        <li>Max no seu WhatsApp, 24 horas</li>
        <li>Raio-x de todos os seus anúncios, quantas vezes quiser</li>
        <li>Ajuda com preço, fotos, descrição e mensagens pro hóspede</li>
        <li>Tudo com o método do Rômulo Villela</li>
      </ul>
      ${cta("Começar pela análise grátis")}
    </div>
  </div>
</section>

<!-- PERGUNTAS -->
<section id="perguntas">
  <div class="wrap">
    <div style="text-align:center"><span class="label rv">Perguntas</span><h2 class="rv" style="--d:.1s;margin-top:10px">Antes de mandar o oi</h2></div>
    <div class="faq">
      <details class="rv"><summary>A análise é grátis mesmo?</summary><p>É. Você manda o link do seu anúncio pro Max no WhatsApp e recebe a análise sem pagar nada e sem cadastro.</p></details>
      <details class="rv" style="--d:.05s"><summary>Preciso ser aluno do Rômulo?</summary><p>Não. Qualquer anfitrião pode pedir a análise. Quem já é da comunidade (Anfitrião 5 Estrelas, Gigantes ou Black) já tem o Max incluído.</p></details>
      <details class="rv" style="--d:.1s"><summary>E se o meu anúncio estiver no Booking?</summary><p>O Max conhece as regras do Airbnb e do Booking e tira dúvidas das duas plataformas. A análise grátis é do anúncio no Airbnb: é só mandar o link.</p></details>
      <details class="rv" style="--d:.15s"><summary>O que acontece depois da análise?</summary><p>Você decide. Se quiser o Max com você o ano inteiro, ele mesmo te passa o link de assinatura. Se não, a análise é sua.</p></details>
    </div>
  </div>
</section>

<!-- FINAL -->
<section class="final" style="background:#fff">
  <div class="wrap">
    <div class="av-final rv pop"><img src="/max/avatar.jpg" alt="Max, o Concierge"></div>
    <h2 class="rv" style="--d:.1s">Seu anúncio pode estar <span class="c">deixando dinheiro na mesa</span>.</h2>
    <p class="lead rv" style="--d:.2s">Descubra em poucos minutos, sem pagar nada. Manda um oi pro Max.</p>
    <div class="rv" style="--d:.3s">${cta("Pegar minha análise grátis")}</div>
  </div>
</section>

<footer>Canal do Anfitrião · Rômulo Villela</footer>

<div class="barra" id="barra">${cta("Pegar minha análise grátis")}</div>

<script>
(function(){
  var reduz = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  function quando(el, fn, limiar){
    if(!('IntersectionObserver' in window)){fn();return}
    var io = new IntersectionObserver(function(es){es.forEach(function(e){if(e.isIntersecting){io.disconnect();fn()}})},{threshold:limiar||.25});
    io.observe(el);
  }
  // revelação
  var rvs = document.querySelectorAll('.rv');
  if(!('IntersectionObserver' in window) || reduz){rvs.forEach(function(e){e.classList.add('on')})}
  else{
    var io = new IntersectionObserver(function(es){es.forEach(function(e){if(e.isIntersecting){e.target.classList.add('on');io.unobserve(e.target)}})},{threshold:.15,rootMargin:'0px 0px -6% 0px'});
    rvs.forEach(function(e){io.observe(e)});
  }
  // conversas com "digitando"
  function tocar(body, aoMax){
    var ms = [].slice.call(body.querySelectorAll('.m'));
    var dig = body.querySelector('.typing');
    if(reduz){ms.forEach(function(m){m.classList.add('on')});if(aoMax)aoMax();return}
    var i = 0;
    function prox(){
      if(i >= ms.length) return;
      var m = ms[i++];
      var espera = parseInt(m.getAttribute('data-p')||'800',10);
      if(m.hasAttribute('data-max')){
        setTimeout(function(){
          body.appendChild(dig); dig.classList.add('on');
          setTimeout(function(){dig.classList.remove('on'); m.classList.add('on'); if(m.hasAttribute('data-virou')&&aoMax)aoMax(); prox()},1300);
        },espera);
      } else {
        setTimeout(function(){m.classList.add('on'); if(m.getAttribute('data-hora'))relogio(); prox()},espera);
      }
    }
    prox();
  }
  var hero = document.querySelector('[data-chat="hero"]');
  if(hero) setTimeout(function(){tocar(hero)},500);
  // 00:03: o relógio corre de 23:33 até 00:03
  var sec = document.getElementById('madrugada');
  var hEl = sec.querySelector('[data-h]'), mEl = sec.querySelector('[data-mi]');
  function relogio(){
    var t = 0, passos = 30;
    var id = setInterval(function(){
      t++; var min = 33 + t; var h = 23;
      if(min >= 60){min -= 60; h = 0}
      hEl.textContent = (h<10?'0':'')+h; mEl.textContent = (min<10?'0':'')+min;
      if(t >= passos) clearInterval(id);
    },45);
  }
  var madr = sec.querySelector('[data-chat="madrugada"]');
  quando(sec, function(){tocar(madr, function(){sec.classList.add('virou')})}, .35);
  // raio-x
  var raio = document.getElementById('raio');
  quando(raio.querySelector('.anuncio'), function(){raio.classList.add('on')}, .4);
  // mesinha: entra, acende as 3 pernas, uma falha e a mesa cai, o Max confere
  var mesa = document.getElementById('mesa');
  var timers = [];
  function mesaRodar(){
    timers.forEach(clearTimeout); timers = [];
    mesa.classList.remove('s1','s2','s3','s4','s5','s6');
    if(reduz){mesa.classList.add('s1','s2','s3','s4','s6');return}
    var passos = [[200,'s1'],[1300,'s2'],[2500,'s3'],[3700,'s4'],[5600,'s5'],[8200,'s6']];
    passos.forEach(function(p){timers.push(setTimeout(function(){mesa.classList.add(p[1])},p[0]))});
  }
  quando(mesa.querySelector('.mesa-svg'), mesaRodar, .45);
  mesa.querySelector('[data-denovo]').addEventListener('click', mesaRodar);
  // números contando
  var fmt = function(n){return n >= 1000 ? n.toLocaleString('pt-BR') : String(n)};
  document.querySelectorAll('[data-conta]').forEach(function(el){
    var alvo = parseInt(el.getAttribute('data-conta'),10);
    el.textContent = '0';
    quando(el, function(){
      if(reduz){el.textContent = fmt(alvo);return}
      var t0 = performance.now(), dur = 1400;
      (function f(t){var p = Math.min(1,(t-t0)/dur); p = 1-Math.pow(1-p,3); el.textContent = fmt(Math.round(alvo*p)); if(p<1)requestAnimationFrame(f)})(t0);
    }, .6);
  });
  // topo sólido e barra fixa
  var topo = document.getElementById('topo'), barra = document.getElementById('barra');
  var heroSec = document.getElementById('inicio'), precoSec = document.getElementById('preco');
  function rolar(){
    var y = window.scrollY;
    topo.classList.toggle('solido', y > 40);
    var fimHero = heroSec.offsetTop + heroSec.offsetHeight - 80;
    barra.classList.toggle('on', y > fimHero);
  }
  window.addEventListener('scroll', rolar, {passive:true}); rolar();
  // rastreio próprio (tabela max_lp_eventos): visita e clique, com as UTMs do link
  function beacon(tipo){
    var b = JSON.stringify({t:tipo, u:location.search, ref:document.referrer||''});
    try{if(navigator.sendBeacon && navigator.sendBeacon('/max/t', new Blob([b],{type:'text/plain'})))return}catch(e){}
    try{fetch('/max/t',{method:'POST',body:b,keepalive:true})}catch(e){}
  }
  beacon('pv');
  var origem = new URLSearchParams(location.search).get('utm_source') || 'direto';
  // clique no WhatsApp: evento próprio no pixel (não muda a otimização dos anúncios)
  document.querySelectorAll('[data-cta]').forEach(function(a){
    a.addEventListener('click', function(){
      beacon('clique');
      try{if(window.fbq)fbq('trackCustom','MaxWhatsApp',{origem:origem})}catch(e){}
    });
  });
})();
</script>
</body>
</html>`;
}
