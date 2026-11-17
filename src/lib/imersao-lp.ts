// LP de venda da Imersão A5E (ingresso R$ 27), servida em
// link.canaldoanfitriao.com.br/imersao-chuva-de-reservas-airbnb.
//
// Base: LP longa 01c da Imersão Chuva de Reservas (out/2025, WordPress),
// adaptada pro formato semanal: um ingresso só, turma todo fim de semana, sem
// lote, sem VIP/replay, sem Zoom e sem dizer "ao vivo" nem "gravado". A data e
// o contador vêm da turma à venda (próximo sábado cujo 9h ainda não chegou).
// Imagens em public/lp/imersao/.
//
// NÚMEROS DE PROVA. A bio do professor segue o card aprovado em 17/11/2026;
// o faturamento ainda é o da LP de 2025 (conferir).

const PROVA = {
  faturamento: "R$ 3,9 milhões",
  imoveis: "60",
};
const BIO = {
  resumo: "Criador de um dos maiores canais educacionais sobre aluguel por temporada do Brasil.",
  destaques: [
    "+200.000 seguidores no Instagram",
    "+120.000 inscritos no YouTube",
    "+2.000 alunos formados nos cursos online",
    `Gerencia portfólio de ${PROVA.imoveis}+ imóveis de temporada`,
    "Palestrante em eventos oficiais do Airbnb",
  ],
  frase:
    "Minha missão é democratizar o conhecimento sobre aluguel de temporada e criar a maior comunidade de anfitriões profissionais do Brasil.",
};
// Preço do ingresso: tem que bater com o produto na Eduzz.
const PRECO = { reais: "27", centavos: "00" };
const PRECO_NUM = Number(`${PRECO.reais}.${PRECO.centavos}`);
const SUPORTE_WHATSAPP = { texto: "(11) 93091-2696", link: "https://wa.me/5511930912696" };

const A = "/lp/imersao"; // pasta das imagens

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export interface LpTurma {
  /** ISO do início de sábado (contador) */
  inicioSabado: string;
  /** "21 e 22 de novembro" */
  dias: string;
  /** "21/11" e "22/11" */
  sabadoCurto: string;
  domingoCurto: string;
  /** "9h às 16h" */
  horario: string;
}

export function lpHtml(t: LpTurma, comprarHref: string, pixelId: string | null): string {
  const quando = `Sábado e domingo, ${esc(t.dias)}, das ${esc(t.horario)}`;
  const botao = (texto = "Garantir meu ingresso") =>
    `<a class="btn" href="${esc(comprarHref)}" data-comprar>${texto}<span aria-hidden="true">→</span></a>`;

  const cards = [
    {
      img: "anuncio",
      titulo: "Como montar um anúncio que impressiona e converte",
      sub: "A diferença entre “que lindo” e “vou reservar agora”.",
      texto:
        "Existe uma grande diferença entre anúncios que as pessoas salvam nos favoritos e anúncios que geram reserva imediata. Vou mostrar exatamente onde focar: as 3 primeiras linhas do título que determinam se você aparece nas buscas, as 5 fotos que realmente importam (o resto é vaidade) e a técnica de descrição “problema-solução” que usei para aumentar conversões em 40% nos meus imóveis.",
      sai: "Títulos que funcionam + estrutura de descrição que vende + checklist de fotos essenciais.",
      cor: "claro",
    },
    {
      img: "algoritmo",
      titulo: "Decifrando o algoritmo do Airbnb",
      sub: "Por que você sumiu das buscas e como voltar",
      texto: `O Airbnb tem regras sobre quem aparece primeiro nas buscas. Vou explicar quais são, o que mudou e, principalmente, o que fazer quando seu anúncio para de aparecer do nada. Estratégias que eu uso nos mais de ${PROVA.imoveis} imóveis que administro, e que foram confirmadas pra mim pelo próprio Airbnb.`,
      sai: "Você descobre se está invisível e aprende a voltar a aparecer nas buscas.",
      cor: "forte",
    },
    {
      img: "analise",
      titulo: "Análise de anúncios reais",
      sub: "Feedback direto, sem filtros, com soluções práticas",
      texto:
        "Chega de achismo. Vou analisar anúncios reais mostrando por que não estão convertendo, o que fazer melhor e as mudanças de 10 minutos que geram resultado. Você vê o processo de análise acontecendo e replica no seu anúncio.",
      sai: "Melhorias imediatas para conseguir reservas já no dia seguinte + lista do que não fazer no seu anúncio.",
      cor: "forte",
    },
    {
      img: "precificacao",
      titulo: "Precificação inteligente (pare de chutar valores)",
      sub: "Como cobrar mais e lotar o calendário",
      texto:
        "Vou provar com números reais por que deixar um preço fixo é um tiro no pé e ensinar o método de precificação que flutua com a demanda que eu utilizo. Você vai entender como transformar dias parados em oportunidade, eventos sazonais em picos de venda e como usar a psicologia de preços para parecer barato cobrando caro.",
      sai: "Estratégias específicas de precificação dinâmica.",
      cor: "claro",
    },
    {
      img: "selo",
      titulo: "Como ganhar o selo “Preferido dos hóspedes”",
      sub: "O distintivo que coloca o seu anúncio em destaque no Airbnb",
      texto:
        "O “Preferido dos hóspedes” é o selo mais valioso do Airbnb: coloca no seu anúncio um distintivo visível nas buscas. Vou revelar os critérios que o Airbnb usa, quanto precisa em cada um e, principalmente, o caminho mais rápido para conseguir.",
      sai: "Melhores práticas para conquistar o selo + estratégias para manter depois de conseguir.",
      cor: "forte largo",
    },
  ];

  const faq = [
    {
      p: "A imersão é para iniciantes no Airbnb?",
      r: "Sim. É para quem está começando e para quem já anuncia e quer resultado melhor. Se você já tem anúncio, vai poder ajustá-lo durante a imersão. Se ainda não tem, vai criar o seu já do jeito certo.",
    },
    {
      p: "Quando acontece?",
      r: `${quando} (horário de Brasília). São dois dias, sábado e domingo, e a sala abre 30 minutos antes.`,
    },
    {
      p: "Vai ter replay?",
      r: "Não. A imersão acontece só no sábado e no domingo, no horário marcado, e não fica disponível depois. Reserve o seu fim de semana.",
    },
    {
      p: "Como eu acesso a imersão?",
      r: "Logo depois da compra você recebe o link da sala. É o mesmo link nos dois dias, e você pode assistir pelo computador ou pelo celular.",
    },
    {
      p: "Posso desistir do meu ingresso?",
      r: `Sim. Você pode pedir o reembolso em até 7 dias depois da compra. Se tiver qualquer dúvida, fale com o nosso suporte no WhatsApp <a href="${SUPORTE_WHATSAPP.link}" target="_blank" rel="noopener">${SUPORTE_WHATSAPP.texto}</a>.`,
    },
  ];

  const pixel = pixelId
    ? `<script>!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');fbq('init',${JSON.stringify(pixelId)});fbq('track','PageView');document.addEventListener('click',function(e){var a=e.target.closest&&e.target.closest('[data-comprar]');if(a)fbq('track','InitiateCheckout',{value:${PRECO_NUM},currency:'BRL'})});</script>`
    : "";

  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Imersão Chuva de Reservas no seu Airbnb</title>
<meta name="description" content="Seu anúncio no topo do ranking do Airbnb: como montar o melhor anúncio em um fim de semana. ${quando}. Ingresso R$ ${PRECO.reais},${PRECO.centavos}.">
<meta property="og:title" content="Imersão Chuva de Reservas no seu Airbnb">
<meta property="og:description" content="Como montar o melhor anúncio do Airbnb em um fim de semana. ${quando}.">
<meta property="og:image" content="${A}/hero.webp">
<link rel="icon" href="/icon-192.png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<style>
:root{--coral:#ff5a5f;--rosa:#e8175d;--claro:#fff0f1;--tinta:#222;--tinta2:#555;--escuro:#181818;--linha:#ffd5d8}
*{box-sizing:border-box}
html{scroll-behavior:smooth}
body{margin:0;background:#fff;color:var(--tinta);font:16px/1.55 "Plus Jakarta Sans",system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;-webkit-font-smoothing:antialiased}
img{max-width:100%;height:auto;display:block}
.wrap{width:100%;max-width:1120px;margin:0 auto;padding:0 16px}
h1,h2,h3{margin:0;letter-spacing:-.02em;line-height:1.15}
.btn{display:inline-flex;align-items:center;gap:12px;background:linear-gradient(90deg,var(--rosa),var(--coral));color:#fff;font-weight:700;text-decoration:none;padding:16px 28px;border-radius:999px;box-shadow:0 10px 24px -10px rgba(232,23,93,.7);transition:transform .15s}
.btn:hover{transform:translateY(-2px)}
.btn span{font-size:20px;line-height:1}
/* barra do topo */
.topo{background:var(--coral);color:#fff}
.topo .wrap{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:8px 24px;padding-top:10px;padding-bottom:10px}
.topo .quando{font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:.02em}
.cont{display:flex;align-items:center;gap:14px;font-size:12px;font-weight:600}
.cont b{display:block;font-size:22px;line-height:1;text-align:center}
.cont small{display:block;font-size:9px;letter-spacing:.08em;opacity:.9;text-align:center}
/* hero */
.hero{position:relative;overflow:hidden;background:#fff}
.hero .foto-m{display:block;margin:12px auto 0;width:100%;max-width:520px}
.hero .foto-d{display:none}
.hero .txt{position:relative;padding:8px 0 40px;max-width:560px}
.logo{width:150px;margin-bottom:16px}
.hero h1{font-size:28px;font-weight:800;text-transform:uppercase;color:#3b3b3b}
.hero p{font-size:18px;color:var(--tinta2);margin:14px 0 26px}
.hero .preco-mini{margin-top:12px;font-size:14px;color:var(--tinta2)}
@media(min-width:900px){
  .hero{min-height:620px;display:flex;align-items:center}
  .hero .foto-m{display:none}
  .hero .foto-d{display:block;position:absolute;right:-6%;top:0;height:100%;width:auto;max-width:none}
  .hero .txt{padding:64px 0}
  .hero h1{font-size:40px}
}
/* seções */
section.s{padding:64px 0}
.titulo{font-size:28px;font-weight:800;text-align:center;max-width:640px;margin:0 auto 32px}
@media(min-width:900px){.titulo{font-size:36px}}
.cards{display:grid;gap:16px}
@media(min-width:760px){.cards{grid-template-columns:1fr 1fr}.card.largo{grid-column:1/-1;display:grid;grid-template-columns:1fr 1.2fr;align-items:center;gap:20px}}
.card{border-radius:22px;padding:16px;border:1px solid var(--linha)}
.card.claro{background:var(--claro)}
.card.forte{background:var(--coral);color:#fff;border-color:transparent}
.card img{border-radius:14px;width:100%;background:#fff}
.card .c{padding:16px 8px 8px}
.card h3{font-size:22px;font-weight:700}
.card.claro h3{color:var(--rosa)}
.card .sub{font-size:16px;margin:8px 0 12px;opacity:.9}
.card p{font-size:14px;margin:0 0 10px}
.card .sai{font-weight:600}
/* ingresso */
.ingresso{background:linear-gradient(180deg,#fff, var(--claro))}
.caixa{max-width:520px;margin:0 auto;background:var(--escuro);color:#fff;border-radius:24px;padding:32px 24px;text-align:center;box-shadow:0 30px 60px -30px rgba(0,0,0,.5)}
.caixa .logo{margin:0 auto 12px;filter:brightness(0) invert(1)}
.caixa .q{font-size:14px;opacity:.85;margin-bottom:20px}
.caixa ul{list-style:none;margin:0 0 24px;padding:0;text-align:left}
.caixa li{display:flex;gap:10px;padding:10px 0;border-bottom:1px solid rgba(255,255,255,.1);font-size:15px}
.caixa li:before{content:"✓";color:#22c55e;font-weight:800}
.caixa .por{font-size:14px;opacity:.8}
.caixa .valor{font-size:64px;font-weight:800;line-height:1;margin:6px 0 22px;letter-spacing:-.03em}
.caixa .valor small{font-size:24px;vertical-align:top;margin-right:6px}
.caixa .valor sup{font-size:26px}
.caixa .seguro{font-size:12px;opacity:.6;margin-top:14px}
/* programação */
.prog{background:var(--escuro);color:#fff}
.prog .tag{display:inline-block;border:1px solid rgba(255,90,95,.6);background:rgba(255,90,95,.12);border-radius:999px;padding:6px 14px;font-size:13px;margin-bottom:16px}
.prog .cab{text-align:center;max-width:680px;margin:0 auto 32px}
.prog .cab h2{font-size:28px;font-weight:800}
.prog .cab p{opacity:.8;margin-top:10px}
.dias{display:grid;gap:16px}
@media(min-width:760px){.dias{grid-template-columns:1fr 1fr}}
.dia{border:1px solid rgba(255,255,255,.12);border-radius:18px;overflow:hidden;background:#202020}
.dia h3{background:linear-gradient(90deg,var(--coral),var(--rosa));text-align:center;font-size:26px;padding:14px}
.dia .corpo{padding:22px}
.dia h4{margin:0 0 16px;font-size:20px;border-left:4px solid var(--coral);padding-left:14px}
.pill{display:inline-block;border:1px solid rgba(255,90,95,.5);border-radius:999px;padding:6px 14px;font-size:13px;margin:0 6px 8px 0}
.formato{display:grid;gap:24px;align-items:center;margin-top:56px}
@media(min-width:760px){.formato{grid-template-columns:1fr 1fr}}
.formato img{border-radius:22px;max-width:360px;margin:0 auto}
.formato h2{font-size:28px;font-weight:800}
.formato h2 em{font-style:normal;color:var(--coral)}
.formato ul{list-style:none;padding:0;margin:16px 0 0}
.formato li{border:1px solid rgba(255,90,95,.4);background:rgba(255,90,95,.08);border-radius:14px;padding:14px 16px;margin-bottom:10px}
/* professor */
.prof{background:#000}
.prof .wrap{display:grid;gap:24px;align-items:center}
@media(min-width:860px){.prof .wrap{grid-template-columns:1.05fr 1fr;gap:32px}}
.prof .foto{width:100%;max-width:560px;margin:0 auto;border-radius:22px}
.prof .bio{background:#fff;color:#111;border-radius:24px;padding:28px 22px}
@media(min-width:860px){.prof .bio{padding:40px}}
.prof .tag{display:inline-block;border:1px solid var(--coral);background:#ffe4e6;color:#333;border-radius:999px;padding:4px 26px;font-size:15px}
.prof h2{font-size:34px;font-weight:800;margin:16px 0 12px;letter-spacing:-.03em}
@media(min-width:860px){.prof h2{font-size:44px}}
.prof .resumo{font-size:17px;color:#333;margin:0 0 18px}
.prof ul{list-style:none;margin:0 0 20px;padding:0}
.prof li{display:flex;align-items:center;gap:14px;background:linear-gradient(90deg,var(--coral),var(--rosa));color:#fff;font-weight:700;font-size:15px;border-radius:999px;padding:12px 22px;margin-bottom:9px;letter-spacing:-.01em}
.prof li:before{content:"✓";flex:none;display:grid;place-items:center;width:26px;height:26px;border-radius:50%;background:#fff;color:#111;font-size:14px;font-weight:800}
.prof .frase{font-size:17px;color:#333;margin:0}
/* faq */
.faq{max-width:680px;margin:0 auto}
details{background:var(--claro);border-radius:18px;padding:18px 22px;margin-bottom:10px}
summary{cursor:pointer;font-weight:700;list-style:none;display:flex;justify-content:space-between;gap:12px}
summary::-webkit-details-marker{display:none}
summary:after{content:"+";font-size:22px;line-height:1;color:var(--rosa)}
details[open] summary:after{content:"–"}
details p{margin:12px 0 0;color:var(--tinta2)}
details a{color:var(--rosa);font-weight:600;text-decoration:underline;text-underline-offset:2px}
.cta-fim{text-align:center;margin-top:36px}
footer{background:var(--escuro);color:#aaa;font-size:13px}
footer .wrap{display:flex;flex-wrap:wrap;justify-content:space-between;gap:12px;padding-top:24px;padding-bottom:24px}
footer a{color:#ddd;text-decoration:none;margin-right:16px}
</style>
${pixel}
</head>
<body>

<div class="topo"><div class="wrap">
  <div class="quando">${esc(t.dias)}, das ${esc(t.horario)} | 100% online</div>
  <div class="cont" id="cont" data-alvo="${esc(t.inicioSabado)}">Começa em:
    <div><b data-u="d">--</b><small>DIAS</small></div>
    <div><b data-u="h">--</b><small>HRS</small></div>
    <div><b data-u="m">--</b><small>MIN</small></div>
    <div><b data-u="s">--</b><small>SEG</small></div>
  </div>
</div></div>

<header class="hero">
  <img class="foto-d" src="${A}/hero.webp" alt="" width="1920" height="900">
  <div class="wrap">
    <img class="foto-m" src="${A}/hero-celular.webp" alt="Rômulo Villela" width="1110" height="448">
    <div class="txt">
      <img class="logo" src="${A}/logo.svg" alt="Imersão Chuva de Reservas" width="158" height="81">
      <h1>Seu anúncio no topo do ranking do Airbnb: como montar o melhor anúncio em um fim de semana</h1>
      <p>Descubra como eu fiz para faturar ${PROVA.faturamento} no último ano apenas com Airbnb.</p>
      ${botao()}
      <div class="preco-mini">Ingresso por R$ ${PRECO.reais},${PRECO.centavos} · ${quando}</div>
    </div>
  </div>
</header>

<section class="s"><div class="wrap">
  <h2 class="titulo">O que você vai dominar em 2 dias de imersão</h2>
  <div class="cards">
    ${cards
      .map(
        (c) => `<article class="card ${c.cor}">
      <img src="${A}/${c.img}.webp" alt="" loading="lazy">
      <div class="c">
        <h3>${c.titulo}</h3>
        <div class="sub">${c.sub}</div>
        <p>${c.texto}</p>
        <p class="sai">Você sai com: ${c.sai}</p>
      </div>
    </article>`
      )
      .join("\n    ")}
  </div>
</div></section>

<section class="s ingresso" id="ingresso"><div class="wrap">
  <h2 class="titulo">Garanta seu lugar na próxima turma</h2>
  <div class="caixa">
    <img class="logo" src="${A}/logo.svg" alt="" width="158" height="81">
    <div class="q">${quando}<br>100% online</div>
    <ul>
      <li>Imersão de 2 dias: sábado e domingo, das ${esc(t.horario)}</li>
      <li>Do anúncio perfeito ao algoritmo, precificação e selo Preferido dos hóspedes</li>
      <li>Assista pelo computador ou pelo celular</li>
      <li>Grupo VIP da turma, com entrada durante a imersão</li>
    </ul>
    <div class="por">por apenas</div>
    <div class="valor"><small>R$</small>${PRECO.reais}<sup>,${PRECO.centavos}</sup></div>
    ${botao()}
    <div class="seguro">Pagamento seguro pela Eduzz · reembolso em até 7 dias</div>
  </div>
</div></section>

<section class="s prog"><div class="wrap">
  <div class="cab">
    <span class="tag">${quando}</span>
    <h2>2 dias intensivos para transformar seu Airbnb em uma máquina de dinheiro</h2>
    <p>Descubra como eu fiz para faturar ${PROVA.faturamento} no último ano apenas com Airbnb.</p>
  </div>
  <div class="dias">
    <div class="dia"><h3>Sábado | ${esc(t.sabadoCurto)}</h3><div class="corpo">
      <h4>Construção do anúncio perfeito</h4>
      <span class="pill">Manhã (9h–12h)</span><span class="pill">Almoço (12h–13h30)</span><span class="pill">Tarde (13h30–16h)</span>
    </div></div>
    <div class="dia"><h3>Domingo | ${esc(t.domingoCurto)}</h3><div class="corpo">
      <h4>Algoritmo e estratégias avançadas</h4>
      <span class="pill">Manhã (9h–12h)</span><span class="pill">Almoço (12h–13h30)</span><span class="pill">Tarde (13h30–16h)</span>
    </div></div>
  </div>
  <div class="formato">
    <img src="${A}/formato.webp" alt="" loading="lazy">
    <div>
      <h2>Formato <em>prático</em></h2>
      <p>Durante a imersão você vai:</p>
      <ul>
        <li>Ajustar o seu anúncio passo a passo, junto com a aula</li>
        <li>Ver análises honestas de anúncios que não convertem</li>
        <li>Entender por que alguns anfitriões cobram mais e lotam</li>
        <li>Tirar as dúvidas mais frequentes de quem anuncia no Airbnb</li>
      </ul>
    </div>
  </div>
  <div class="cta-fim">${botao()}</div>
</div></section>

<section class="s prof"><div class="wrap">
  <img class="foto" src="${A}/romulo.webp" alt="Rômulo Villela" loading="lazy" width="606" height="804">
  <div class="bio">
    <span class="tag">Quem será seu professor</span>
    <h2>Prazer, Rômulo Villela</h2>
    <p class="resumo">${BIO.resumo}</p>
    <ul>
      ${BIO.destaques.map((d) => `<li>${d}</li>`).join("\n      ")}
    </ul>
    <p class="frase">“${BIO.frase}”</p>
  </div>
</div></section>

<section class="s"><div class="wrap">
  <h2 class="titulo">Perguntas frequentes</h2>
  <div class="faq">
    ${faq.map((f) => `<details><summary>${f.p}</summary><p>${f.r}</p></details>`).join("\n    ")}
  </div>
  <div class="cta-fim">${botao()}</div>
</div></section>

<footer><div class="wrap">
  <div>Imersão Chuva de Reservas no seu Airbnb</div>
  <div><a href="https://www.instagram.com/canaldoanfitriao/" rel="noopener">Instagram</a><a href="https://www.youtube.com/c/CanaldoAnfitri%C3%A3o" rel="noopener">YouTube</a>© ${new Date().getFullYear()} Canal do Anfitrião</div>
</div></footer>

<script>
(function(){var c=document.getElementById('cont');if(!c)return;var alvo=new Date(c.getAttribute('data-alvo')).getTime();
function p(n){return n<10?'0'+n:''+n}
function tick(){var s=Math.max(0,Math.floor((alvo-Date.now())/1000));
var v={d:Math.floor(s/86400),h:Math.floor(s%86400/3600),m:Math.floor(s%3600/60),s:s%60};
c.querySelectorAll('[data-u]').forEach(function(b){b.textContent=p(v[b.getAttribute('data-u')])})}
tick();setInterval(tick,1000)})();
</script>
</body>
</html>`;
}
