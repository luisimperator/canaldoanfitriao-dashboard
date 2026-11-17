// LP de venda da Imersão A5E (ingresso R$ 27, de R$ 97), servida em
// link.canaldoanfitriao.com.br/imersao-chuva-de-reservas-airbnb.
//
// Formato semanal: um ingresso só, turma todo fim de semana, sem lote, sem
// VIP/replay, sem Zoom e sem dizer "ao vivo". Uma linha discreta no FAQ diz
// que o conteúdo é a gravação da imersão completa, exibida no horário marcado.
// A data e os contadores vêm da turma à venda (próximo sábado cujo 9h ainda
// não chegou).
// Imagens em public/lp/imersao/.
//
// O texto fica todo nos blocos de dados logo abaixo (CONTEUDO); o HTML/CSS/JS
// só monta. Motion: revelar ao rolar, contadores, chat que "digita", preço
// riscado animado, brilho no botão e no card do ingresso. Tudo desliga com
// prefers-reduced-motion.

// ---------- preço (tem que bater com o produto na Eduzz) ----------
const PRECO = { de: 97, por: 27 };
const DESCONTO = Math.round((1 - PRECO.por / PRECO.de) * 100);
const SUPORTE_WHATSAPP = { texto: "(11) 92507-2167", link: "https://wa.me/5511925072167" };
// Pixel do Meta da conta do Canal do Anfitrião (IMERSAO_META_PIXEL_ID na Vercel sobrepõe).
export const PIXEL_PADRAO = "809047156423185";

// ---------- conteúdo ----------
const PROVA = {
  faturamento: "R$ 3,9 milhões", // ainda o número da LP de 2025: conferir
  imoveis: "60",
};

const NUMEROS = [
  { valor: 200, sufixo: " mil", prefixo: "+", rotulo: "seguidores no Instagram" },
  { valor: 120, sufixo: " mil", prefixo: "+", rotulo: "inscritos no YouTube" },
  { valor: 2000, sufixo: "", prefixo: "+", rotulo: "alunos formados" },
  { valor: 60, sufixo: "+", prefixo: "", rotulo: "imóveis sob gestão" },
];

const TICKER = [
  "Título que aparece nas buscas",
  "As 5 fotos que decidem a reserva",
  "Descrição problema-solução",
  "Algoritmo do Airbnb",
  "Precificação dinâmica",
  "Promoções que mexem no ranking",
  "Selo Preferido dos hóspedes",
  "Análise de anúncios reais",
];

const CARDS = [
  {
    img: "anuncio",
    titulo: "O anúncio que impressiona e converte",
    sub: "A diferença entre “que lindo” e “vou reservar agora”.",
    texto:
      "As 3 primeiras linhas do título que decidem se você aparece nas buscas, as 5 fotos que realmente importam (o resto é vaidade) e a descrição “problema-solução” que aumentou as conversões em 40% nos meus imóveis.",
    sai: "Títulos que funcionam + estrutura de descrição que vende + checklist de fotos.",
  },
  {
    img: "algoritmo",
    titulo: "Decifrando o algoritmo do Airbnb",
    sub: "Por que você sumiu das buscas e como voltar.",
    texto: `Quem aparece primeiro, o que mudou e o que fazer quando o anúncio some do nada. Estratégias que eu uso nos mais de ${PROVA.imoveis} imóveis que administro.`,
    sai: "Como descobrir se está invisível e voltar a aparecer.",
  },
  {
    img: "analise",
    titulo: "Análise de anúncios reais",
    sub: "Feedback direto, sem filtro.",
    texto:
      "Anúncios reais destrinchados: por que não convertem, o que fazer melhor e as mudanças de 10 minutos que geram resultado.",
    sai: "Melhorias pra reservar já no dia seguinte.",
  },
  {
    img: "precificacao",
    titulo: "Precificação inteligente",
    sub: "Cobrar mais e lotar o calendário.",
    texto:
      "Por que preço fixo é um tiro no pé, como transformar dias parados em oportunidade e usar a psicologia de preços pra parecer barato cobrando caro.",
    sai: "Precificação dinâmica na prática.",
  },
  {
    img: "selo",
    titulo: "O selo “Preferido dos hóspedes”",
    sub: "O distintivo que te destaca nas buscas.",
    texto:
      "Os critérios que o Airbnb usa, quanto precisa em cada um e o caminho mais rápido pra conquistar (e manter) o selo.",
    sai: "Plano pra conquistar e manter o selo.",
  },
];

// Programação: na ordem em que aconteceu na turma de out/2025 (transcrição).
const PROGRAMACAO = {
  sabado: {
    tema: "O anúncio que converte e o preço certo",
    topicos: [
      "Os 3 pilares: anúncio, preço e algoritmo",
      "A roda do Airbnb: ranking → clique → reserva → avaliação",
      "Foto de capa, mosaico de 5 fotos, título e descrição",
      "Preço competitivo e dinâmico, com calendário de demanda",
      "Instagram e reserva direta: vale a pena?",
      "Booking × Airbnb, coanfitrião e gestão pra terceiros",
    ],
  },
  domingo: {
    tema: "Métricas, algoritmo e avaliações",
    topicos: [
      "A ferramenta escondida do Airbnb e as métricas do anúncio",
      "Avaliações: como estimular as boas e pedir a retirada das injustas",
      "Como agradar o algoritmo: promoções e descontos",
      "Preferido dos hóspedes × Superhost",
      "Análise de anúncios reais, com as métricas de cada um",
    ],
  },
};

// Ganchos tirados da transcrição da turma de out/2025.
const SEGREDOS = [
  { t: "O Airbnb tem uma ferramenta escondida", d: "As métricas que mostram se o anúncio vai bem só aparecem depois que você ativa um recurso nas configurações. Você vai sair sabendo onde fica." },
  { t: "Os 4 números que dizem se seu anúncio vai bem", d: "Quanto aparece na primeira página, quanto clicam, quanto reservam. Você aprende a ler e a saber qual consertar primeiro." },
  { t: "Não baixe o preço: crie uma promoção", d: "Baixar o preço faz o algoritmo achar que esse é o seu novo preço. A promoção avisa quem já pesquisou aquelas datas." },
  { t: "10%, 15% ou 20%: cada faixa destrava algo", d: "Preço riscado, selo de desconto e até os e-mails que o próprio Airbnb dispara. Cada faixa tem um efeito diferente." },
  { t: "Menos de 20 comodidades? Você está invisível", d: "Se tem ar-condicionado e não marcou, quem filtra por ar-condicionado nunca vai ver o seu anúncio." },
  { t: "Um comentário longo vale mais que 5 estrelas", d: "Dois anúncios nota 5 não pesam igual pro algoritmo. O que está escrito nas avaliações conta." },
  { t: "Calendário lotado por 3 meses é sinal de alerta", d: "Normalmente quer dizer que você está cobrando mais barato do que poderia." },
  { t: "75% dos hóspedes não clicam em “mostrar mais”", d: "O começo da descrição precisa resolver tudo. O resto quase ninguém lê." },
];

// Frases do Rômulo na turma de out/2025.
const FALAS = [
  "O algoritmo não faz caridade. Ele quer conversão.",
  "Bota na sua cabeça que preço não é fixo.",
];

// Mensagens do chat da turma de out/2025 (primeiro nome + cidade).
const CHAT = [
  { nome: "Elza", cidade: "Maceió", texto: "Rômulo, só com a mudança de foto de capa tive uma reserva instantânea de cinco dias no apê de Maceió. Agoraaaa!" },
  { nome: "Tatiana", cidade: "", texto: "Mudei a foto de capa e o título do anúncio e a taxa de busca DOBROU." },
  { nome: "Glaucia", cidade: "Angra dos Reis", texto: "Fiz essa promoção e acabei de alugar. Fiz agora há pouco!" },
  { nome: "Helen", cidade: "", texto: "Essa informação foi ótima! Fazer promoção pra mexer com o algoritmo ao invés de somente abaixar o preço!" },
  { nome: "Aparecida", cidade: "", texto: "Os dois foram ótimos, mas hoje muito melhor! Meu anúncio foi analisado!" },
  { nome: "Iolanda", cidade: "Niterói", texto: "Você é muito didático, até eu, uma senhora idosa, entendi." },
];

// Versão curta: o que se aprende, em 4 linhas.
const CURTA_TOPICOS = [
  "Foto de capa, mosaico de 5 fotos, título e descrição que fazem o anúncio ser clicado",
  "Como o algoritmo decide quem aparece e as métricas escondidas do seu anúncio",
  "Preço dinâmico e promoções no lugar de só baixar o preço",
  "Avaliações e o selo Preferido dos hóspedes",
];

const PARA_QUEM = [
  "Já anuncia e quer se destacar nas buscas",
  "Vai estrear o primeiro imóvel e não quer errar",
  "Tem quarto, studio, chalé, casa de praia ou pousada",
  "Faz gestão pra terceiros ou é coanfitrião",
  "Quer transformar renda extra em renda principal",
];

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

const A = "/lp/imersao"; // pasta das imagens

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export interface LpTurma {
  /** turma (data do sábado, AAAA-MM-DD) */
  turma: string;
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

export type Variante = "longa" | "curta";

export function lpHtml(t: LpTurma, comprarHref: string, pixelId: string | null, variante: Variante = "longa"): string {
  const longa = variante === "longa";
  const quando = `Sábado e domingo, ${esc(t.dias)}, das ${esc(t.horario)}`;
  const href = esc(comprarHref);
  const botao = (texto = "Garantir meu ingresso", extra = "") =>
    `<a class="btn ${extra}" href="${href}" data-comprar><span>${texto}</span><i aria-hidden="true">→</i></a>`;
  const precoDe = `<s class="risca">R$ ${PRECO.de}</s>`;

  const faq = [
    {
      p: "A imersão é para iniciantes no Airbnb?",
      r: "Sim. É para quem está começando e para quem já anuncia e quer resultado melhor. Se você já tem anúncio, vai ajustá-lo durante a imersão. Se ainda não tem, vai criar o seu já do jeito certo.",
    },
    {
      p: "Quando acontece?",
      r: `${quando} (horário de Brasília). A sala abre 30 minutos antes. O conteúdo é uma gravação da imersão completa, exibida no horário marcado.`,
    },
    {
      p: "Serve pra quarto, studio, chalé ou casa de praia?",
      r: "Serve. Os conceitos de anúncio, preço e algoritmo são os mesmos para qualquer tipo de imóvel, de um quarto na sua casa a uma pousada.",
    },
    {
      p: "Fala de Booking também?",
      r: "Fala. A imersão compara Booking e Airbnb e mostra quando vale a pena estar nos dois. O foco é o Airbnb.",
    },
    {
      p: "Fala de imposto, CNPJ ou regras de condomínio?",
      r: "Não. A imersão é sobre o anúncio, o preço, o algoritmo e as avaliações. Imposto e questões jurídicas ficam de fora.",
    },
    {
      p: "Como eu acesso a imersão?",
      r: "Logo depois da compra você recebe o link da sala. É o mesmo link nos dois dias. Dá pra assistir pelo celular, mas recomendamos o computador: é nele que você vai mexer no seu anúncio junto com a aula.",
    },
    {
      p: "Meu anúncio vai ser analisado?",
      r: "Alguns anúncios de participantes são analisados durante a imersão, com as métricas de cada um. Não dá pra garantir que o seu será um deles, mas você vê o processo e aplica no seu.",
    },
    {
      p: "Posso desistir do meu ingresso?",
      r: `Sim. Você pode pedir o reembolso em até 7 dias depois da compra. Se tiver qualquer dúvida, fale com o nosso suporte no WhatsApp <a href="${SUPORTE_WHATSAPP.link}" target="_blank" rel="noopener">${SUPORTE_WHATSAPP.texto}</a>.`,
    },
  ];

  // Versão curta: só as perguntas que mais apareceram no chat.
  const FAQ_CURTA = ["Quando acontece?", "Como eu acesso a imersão?", "Posso desistir do meu ingresso?"];

  // Pixel do Meta: PageView ao carregar. O clique em qualquer botão de compra
  // ([data-comprar]) é tratado no script do fim da página (InitiateCheckout +
  // /t/click antes de seguir pro checkout).
  const pixel = pixelId
    ? `<script>!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');fbq('init',${JSON.stringify(pixelId)});fbq('track','PageView');</script>
<noscript><img height="1" width="1" style="display:none" alt="" src="https://www.facebook.com/tr?id=${encodeURIComponent(pixelId)}&ev=PageView&noscript=1"></noscript>`
    : "";

  const contador = (id: string) => `<div class="cd" data-cd="${id}" aria-label="Contagem regressiva">
      <div><b data-u="d">--</b><small>dias</small></div><span>:</span>
      <div><b data-u="h">--</b><small>horas</small></div><span>:</span>
      <div><b data-u="m">--</b><small>min</small></div><span>:</span>
      <div><b data-u="s">--</b><small>seg</small></div>
    </div>`;

  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>Imersão Chuva de Reservas no seu Airbnb</title>
<meta name="description" content="Seu anúncio no topo do ranking do Airbnb em um fim de semana. ${quando}. De R$ ${PRECO.de} por R$ ${PRECO.por}.">
<meta property="og:title" content="Imersão Chuva de Reservas no seu Airbnb">
<meta property="og:description" content="Seu anúncio no topo do ranking do Airbnb em um fim de semana. ${quando}. De R$ ${PRECO.de} por R$ ${PRECO.por}.">
<meta property="og:image" content="${A}/hero.webp">
<meta name="theme-color" content="#0e0d10">
<link rel="icon" href="/icon-192.png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<style>
:root{
  --coral:#ff385c;--rosa:#e61e4d;--vinho:#bd1e59;--pessego:#ff8a65;
  --papel:#fffaf7;--creme:#fff1ee;--tinta:#141216;--tinta2:#5b5660;--linha:#f1dcd8;
  --noite:#0e0d10;--noite2:#17151a;
  --grad:linear-gradient(100deg,var(--pessego),var(--coral) 45%,var(--rosa) 75%,var(--vinho));
  --raio:26px;--sombra:0 30px 60px -30px rgba(20,10,20,.35);
}
*{box-sizing:border-box}
html{scroll-behavior:smooth;-webkit-text-size-adjust:100%}
body{margin:0;background:var(--papel);color:var(--tinta);font:16px/1.6 "Plus Jakarta Sans",system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;-webkit-font-smoothing:antialiased;overflow-x:hidden}
img{max-width:100%;height:auto;display:block}
a{color:inherit}
.wrap{width:100%;max-width:1160px;margin:0 auto;padding:0 16px}
h1,h2,h3{margin:0;letter-spacing:-.03em;line-height:1.08}
.serif{font-family:"Instrument Serif",Georgia,serif;font-style:italic;font-weight:400;letter-spacing:-.01em}
.grad-txt{background:var(--grad);-webkit-background-clip:text;background-clip:text;color:transparent}
.eyebrow{display:inline-flex;align-items:center;gap:10px;font-size:12px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:var(--rosa)}
.eyebrow:before{content:"";width:22px;height:2px;background:currentColor;border-radius:2px}
.titulo{font-size:clamp(30px,5vw,52px);font-weight:800;max-width:760px}
.titulo.c{text-align:center;margin:0 auto}
.lead{font-size:18px;color:var(--tinta2);max-width:640px}
section{position:relative}
.s{padding:clamp(72px,10vw,128px) 0}

/* barra de progresso + topo */
.prog-bar{position:fixed;top:0;left:0;height:3px;width:100%;transform-origin:0 50%;transform:scaleX(0);background:var(--grad);z-index:60}
.topo{position:sticky;top:0;z-index:50;background:rgba(14,13,16,.92);backdrop-filter:saturate(1.4) blur(14px);-webkit-backdrop-filter:saturate(1.4) blur(14px);color:#fff}
.topo .wrap{display:flex;align-items:center;justify-content:space-between;gap:12px;min-height:54px;padding-top:6px;padding-bottom:6px}
.topo .t1{font-size:12px;font-weight:600;opacity:.85;line-height:1.3}
.topo .t1 b{color:#fff;opacity:1}
.topo .cd{transform:scale(.82);transform-origin:center}
.topo .chip{display:none}
@media(min-width:860px){.topo .chip{display:inline-flex}.topo .cd{transform:none}}
.chip{align-items:center;gap:8px;border:1px solid rgba(255,255,255,.18);border-radius:999px;padding:6px 6px 6px 14px;font-size:13px;font-weight:600;white-space:nowrap}
.chip a{background:#fff;color:var(--noite);text-decoration:none;border-radius:999px;padding:6px 12px;font-weight:700}
.chip s{opacity:.55}
/* contador */
.cd{display:flex;align-items:center;gap:6px;font-variant-numeric:tabular-nums}
.cd>div{text-align:center;min-width:34px}
.cd b{display:block;font-size:20px;font-weight:800;line-height:1}
.cd small{display:block;font-size:9px;letter-spacing:.12em;text-transform:uppercase;opacity:.65;margin-top:3px}
.cd span{opacity:.35;font-weight:700;margin-top:-12px}

/* botão */
.btn{position:relative;isolation:isolate;overflow:hidden;display:inline-flex;align-items:center;gap:14px;background:var(--grad);background-size:160% 100%;color:#fff;font-weight:800;font-size:17px;text-decoration:none;padding:18px 30px;border-radius:999px;box-shadow:0 18px 40px -16px rgba(230,30,77,.75),inset 0 1px 0 rgba(255,255,255,.25);transition:transform .25s cubic-bezier(.2,.8,.2,1),box-shadow .25s,background-position .6s}
.btn:hover{transform:translateY(-3px) scale(1.02);background-position:100% 0;box-shadow:0 26px 50px -18px rgba(230,30,77,.85)}
.btn i{font-style:normal;font-size:20px;transition:transform .25s}
.btn:hover i{transform:translateX(4px)}
.btn:after{content:"";position:absolute;inset:0;z-index:-1;background:linear-gradient(105deg,transparent 35%,rgba(255,255,255,.45) 50%,transparent 65%);transform:translateX(-120%);animation:brilho 3.6s ease-in-out infinite}
@keyframes brilho{0%,55%{transform:translateX(-120%)}85%,100%{transform:translateX(120%)}}
.btn.grande{font-size:19px;padding:22px 36px}
.btn{white-space:nowrap}
@media(max-width:420px){.btn.grande{font-size:17px;padding:19px 26px}}

/* preço riscado */
.risca{position:relative;text-decoration:none;white-space:nowrap}
.risca:after{content:"";position:absolute;left:-4%;right:-4%;top:52%;height:.12em;background:var(--coral);border-radius:2px;transform:rotate(-8deg) scaleX(0);transform-origin:0 50%;transition:transform .7s cubic-bezier(.7,0,.2,1) .25s}
.vis .risca:after,.topo .risca:after,.barra .risca:after{transform:rotate(-8deg) scaleX(1)}

/* hero */
.hero{position:relative;overflow:hidden;padding:40px 0 0}
.aurora{position:absolute;inset:-20% -10% auto -10%;height:120%;z-index:-1;filter:blur(60px);opacity:.75;pointer-events:none}
.aurora i{position:absolute;border-radius:50%;mix-blend-mode:multiply;animation:flutua 18s ease-in-out infinite alternate}
.aurora i:nth-child(1){width:46vw;height:46vw;left:48%;top:0;background:#ffc3cf}
.aurora i:nth-child(2){width:38vw;height:38vw;left:65%;top:28%;background:#ffd8c2;animation-duration:22s}
.aurora i:nth-child(3){width:30vw;height:30vw;left:-6%;top:-8%;background:#ffe3ea;animation-duration:26s}
@keyframes flutua{to{transform:translate3d(-6%,8%,0) scale(1.15)}}
.hero .grid{display:grid;gap:12px;align-items:center}
.hero .txt{padding-bottom:28px}
.selo-top{display:inline-flex;align-items:center;gap:10px;background:#fff;border:1px solid var(--linha);border-radius:999px;padding:6px 14px 6px 8px;font-size:13px;font-weight:600;box-shadow:0 8px 24px -14px rgba(0,0,0,.25)}
.selo-top .dot{width:9px;height:9px;border-radius:50%;background:#22c55e;box-shadow:0 0 0 0 rgba(34,197,94,.6);animation:pulso 1.8s infinite}
@keyframes pulso{to{box-shadow:0 0 0 12px rgba(34,197,94,0)}}
.logo{width:132px;margin:22px 0 14px}
.hero h1{font-size:clamp(38px,5.2vw,64px);font-weight:800}
.hero h1 .serif{font-size:1.08em}
.hero .sub{font-size:clamp(17px,2vw,20px);color:var(--tinta2);margin:18px 0 26px;max-width:540px}
.oferta{display:flex;flex-wrap:wrap;align-items:center;gap:14px 22px;margin-bottom:22px}
.oferta .preco{display:flex;align-items:baseline;gap:10px;line-height:1}
.oferta .de{font-size:22px;color:var(--tinta2);font-weight:600}
.oferta .por{font-size:15px;color:var(--tinta2);font-weight:600}
.oferta .valor{font-size:clamp(52px,6vw,64px);font-weight:800;letter-spacing:-.04em}
.oferta .valor small{font-size:22px;margin-right:4px;vertical-align:top}
.tag-off{display:inline-block;background:var(--noite);color:#fff;font-size:13px;font-weight:800;border-radius:999px;padding:6px 12px;transform:rotate(-3deg)}
.confia{display:flex;flex-wrap:wrap;gap:8px 18px;margin-top:16px;font-size:13px;color:var(--tinta2)}
.confia span:before{content:"✓ ";color:#16a34a;font-weight:800}
.hero .foto{position:relative;align-self:end;max-width:560px;margin:0 auto;width:100%}
.hero .foto .pw{position:relative;container-type:inline-size}
.hero .foto img.p{width:100%;-webkit-mask-image:linear-gradient(to bottom,#000 78%,transparent);mask-image:linear-gradient(to bottom,#000 78%,transparent)}
/* card "Maragogi": cartão de verdade NA FRENTE da foto, cobrindo o que vem
   impresso na imagem (lá ele fica atrás do ombro e com o texto cortado) */
.mg{position:absolute;left:54.6%;top:25.2%;width:40.4%;min-height:41.6%;z-index:2;background:#fff;border-radius:3.2cqw;overflow:hidden;box-shadow:0 3cqw 6cqw -2cqw rgba(20,10,20,.45)}
/* foto do card: o recorte da praia que já está na hero-celular.webp */
.mg .ft{display:block;aspect-ratio:320/168;background:url(${A}/hero-celular.webp) 89.81% 32.29%/265.625% auto no-repeat}
.mg div{padding:2.6cqw 3cqw;line-height:1.25}
.mg b{display:block;font-size:3.6cqw;font-weight:800;color:var(--tinta)}
.mg span{display:block;font-size:2cqw;color:var(--tinta2);margin-top:.6cqw}
.mg hr{border:0;border-top:1px solid var(--linha);margin:1.6cqw 0 1.2cqw}
.float{position:absolute;z-index:3;background:#fff;border-radius:18px;box-shadow:0 20px 40px -18px rgba(0,0,0,.35);padding:10px 14px;font-size:13px;font-weight:700;display:flex;align-items:center;gap:10px;animation:boia 6s ease-in-out infinite}
.float small{display:block;font-weight:500;color:var(--tinta2);font-size:11px}
.float .ic{width:32px;height:32px;border-radius:10px;display:grid;place-items:center;background:var(--creme);font-size:16px}
.f1{left:-2%;top:62%}
.f2{right:0;top:4%;animation-delay:-2s}
.f3{right:4%;bottom:8%;animation-delay:-4s;padding:0;background:none;box-shadow:none;border-radius:0;filter:drop-shadow(0 14px 22px rgba(0,0,0,.18))}
.f3 img{width:120px}
@keyframes boia{50%{transform:translateY(-12px)}}
@media(max-width:600px){.f1{left:0;top:auto;bottom:30%}.f2{top:2%}.f3 img{width:96px}}
@media(min-width:1100px){
  .hero .grid{grid-template-columns:1.1fr .9fr;gap:32px;align-items:stretch}
  .hero{padding-top:48px}
  .hero .foto{align-self:stretch;max-width:none;margin:0;min-height:560px}
  .hero .foto .pw{position:absolute;bottom:0;left:50%;transform:translateX(-46%);height:100%;max-height:760px;aspect-ratio:850/840}
  .hero .foto img.p{width:100%;height:100%}
  .f1{left:-4%;top:auto;bottom:24%}
  .f2{right:-2%;top:6%}
  .f3{right:2%;bottom:4%}
}

/* ticker */
.ticker{background:var(--noite);color:#fff;overflow:hidden;padding:18px 0;transform:rotate(-1.2deg) scale(1.03);margin:10px 0 0}
.ticker .trilho{display:flex;gap:44px;width:max-content;animation:rola 34s linear infinite}
.ticker span{font-size:clamp(16px,2vw,22px);font-weight:700;white-space:nowrap;display:flex;align-items:center;gap:44px}
.ticker span:after{content:"✦";color:var(--coral)}
@keyframes rola{to{transform:translateX(-50%)}}

/* números */
.numeros{display:grid;grid-template-columns:repeat(2,1fr);gap:14px;margin-top:40px}
@media(min-width:860px){.numeros{grid-template-columns:repeat(4,1fr)}}
.num{background:#fff;border:1px solid var(--linha);border-radius:var(--raio);padding:22px}
.num b{display:block;font-size:clamp(30px,4vw,44px);font-weight:800;letter-spacing:-.04em;line-height:1}
.num span{font-size:14px;color:var(--tinta2)}

/* cards (bento) */
.bento{display:grid;gap:16px;margin-top:44px}
@media(min-width:820px){.bento{grid-template-columns:repeat(6,1fr)}.bento .card:nth-child(1),.bento .card:nth-child(2){grid-column:span 3}.bento .card:nth-child(n+3){grid-column:span 2}}
.card{position:relative;background:#fff;border:1px solid var(--linha);border-radius:var(--raio);padding:14px;overflow:hidden;transform-style:preserve-3d;transition:transform .35s cubic-bezier(.2,.8,.2,1),box-shadow .35s}
.card:hover{box-shadow:var(--sombra)}
.card:before{content:"";position:absolute;inset:0;border-radius:inherit;padding:1px;background:var(--grad);-webkit-mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);-webkit-mask-composite:xor;mask-composite:exclude;opacity:0;transition:opacity .35s}
.card:hover:before{opacity:1}
.card .im{border-radius:18px;background:var(--creme);overflow:hidden}
.card .im img{width:100%;transition:transform .6s cubic-bezier(.2,.8,.2,1)}
.card:hover .im img{transform:scale(1.04)}
.card .c{padding:18px 8px 8px}
.card .n{font-size:12px;font-weight:800;color:var(--rosa);letter-spacing:.12em}
.card h3{font-size:22px;font-weight:800;margin:6px 0 4px}
.card .sub{font-size:15px;color:var(--tinta);font-weight:600;margin-bottom:8px}
.card p{font-size:14px;color:var(--tinta2);margin:0 0 10px}
.card .sai{display:inline-block;font-size:13px;font-weight:700;background:var(--creme);color:var(--vinho);border-radius:12px;padding:8px 12px}

/* segredos */
.segredos{background:var(--noite);color:#fff;overflow:hidden}
.segredos .lead{color:rgba(255,255,255,.7)}
.lista-seg{display:grid;gap:12px;margin-top:40px;counter-reset:s}
@media(min-width:820px){.lista-seg{grid-template-columns:1fr 1fr}}
.seg{counter-increment:s;display:grid;grid-template-columns:auto 1fr;gap:16px;align-items:start;background:var(--noite2);border:1px solid rgba(255,255,255,.08);border-radius:22px;padding:20px;transition:border-color .3s,transform .3s}
.seg:hover{border-color:rgba(255,56,92,.6);transform:translateY(-3px)}
.seg:before{content:counter(s,decimal-leading-zero);font-family:"Instrument Serif",serif;font-style:italic;font-size:44px;line-height:.9;background:var(--grad);-webkit-background-clip:text;background-clip:text;color:transparent}
.seg h3{font-size:18px;font-weight:700;letter-spacing:-.01em;margin-bottom:4px}
.seg p{margin:0;font-size:14px;color:rgba(255,255,255,.68)}
.fala{margin:56px auto 0;max-width:820px;text-align:center;font-family:"Instrument Serif",serif;font-style:italic;font-size:clamp(26px,4vw,42px);line-height:1.2}
.fala cite{display:block;font:600 14px/1 "Plus Jakarta Sans",sans-serif;font-style:normal;color:var(--coral);margin-top:16px;letter-spacing:.06em}

/* chat */
.chat-wrap{display:grid;gap:36px;align-items:center}
@media(min-width:900px){.chat-wrap{grid-template-columns:.9fr 1.1fr}}
.janela{background:#fff;border:1px solid var(--linha);border-radius:28px;box-shadow:var(--sombra);overflow:hidden}
.janela .bar{display:flex;align-items:center;gap:8px;padding:14px 18px;border-bottom:1px solid var(--linha);font-size:13px;font-weight:700}
.janela .bar i{width:10px;height:10px;border-radius:50%;background:#ffb4c2}
.janela .bar i:nth-child(2){background:#ffd6a5}.janela .bar i:nth-child(3){background:#b9f0c8}
.janela .bar em{font-style:normal;margin-left:6px}
.janela .bar .ao{margin-left:auto;font-size:11px;color:var(--tinta2);font-weight:600}
.msgs{padding:18px;display:flex;flex-direction:column;gap:12px;min-height:420px}
.msg{max-width:88%;background:var(--creme);border-radius:18px 18px 18px 6px;padding:10px 14px;font-size:15px;opacity:0;transform:translateY(14px) scale(.98);transition:opacity .45s,transform .45s cubic-bezier(.2,.8,.2,1)}
.msg.on{opacity:1;transform:none}
.msg b{display:block;font-size:12px;color:var(--rosa);margin-bottom:2px}
.msg:nth-child(even){align-self:flex-end;background:#fff;border:1px solid var(--linha);border-radius:18px 18px 6px 18px}
.digitando{align-self:flex-start;display:flex;gap:4px;padding:12px 14px;background:var(--creme);border-radius:18px;opacity:0;transition:opacity .2s}
.digitando.on{opacity:1}
.digitando i{width:7px;height:7px;border-radius:50%;background:var(--tinta2);animation:dig 1s infinite}
.digitando i:nth-child(2){animation-delay:.15s}.digitando i:nth-child(3){animation-delay:.3s}
@keyframes dig{50%{transform:translateY(-4px);opacity:.4}}
.pq{list-style:none;padding:0;margin:24px 0 0;display:grid;gap:10px}
.pq li{display:flex;gap:12px;align-items:center;font-weight:600}
.pq li:before{content:"→";display:grid;place-items:center;width:30px;height:30px;flex:none;border-radius:50%;background:var(--grad);color:#fff;font-weight:800}

/* programação */
.dias{display:grid;gap:18px;margin-top:44px}
@media(min-width:820px){.dias{grid-template-columns:1fr 1fr}}
.dia{background:#fff;border:1px solid var(--linha);border-radius:var(--raio);padding:26px;position:relative;overflow:hidden}
.dia .q{display:flex;justify-content:space-between;align-items:baseline;gap:10px}
.dia .q b{font-size:13px;letter-spacing:.14em;text-transform:uppercase;color:var(--rosa)}
.dia .q span{font-family:"Instrument Serif",serif;font-style:italic;font-size:44px;line-height:1}
.dia h3{font-size:24px;font-weight:800;margin:10px 0 18px}
.tl{list-style:none;margin:0;padding:0 0 0 22px;position:relative}
.tl:before{content:"";position:absolute;left:6px;top:6px;bottom:6px;width:2px;background:var(--linha)}
.tl:after{content:"";position:absolute;left:6px;top:6px;width:2px;height:calc(100% - 12px);background:var(--grad);transform:scaleY(0);transform-origin:top;transition:transform 1.2s cubic-bezier(.6,0,.2,1) .2s}
.vis .tl:after{transform:scaleY(1)}
.tl li{position:relative;padding:6px 0 12px;font-weight:600}
.tl li:before{content:"";position:absolute;left:-21px;top:13px;width:12px;height:12px;border-radius:50%;background:#fff;border:2px solid var(--coral)}
.horas{display:flex;flex-wrap:wrap;gap:8px;margin-top:8px}
.horas span{font-size:12px;font-weight:700;border-radius:999px;padding:6px 12px;background:var(--creme);color:var(--vinho)}

/* ingresso */
.ingresso{background:radial-gradient(1200px 600px at 50% -10%,#ffe1e7,transparent 60%),var(--papel)}
.caixa-borda{position:relative;max-width:560px;margin:44px auto 0;border-radius:32px;padding:2px;overflow:hidden}
.caixa-borda:before{content:"";position:absolute;inset:-60%;background:conic-gradient(from 0deg,var(--coral),var(--pessego),#fff0,var(--rosa),var(--vinho),var(--coral));animation:gira 6s linear infinite}
@keyframes gira{to{transform:rotate(1turn)}}
.caixa{position:relative;background:var(--noite);color:#fff;border-radius:30px;padding:34px 26px;text-align:center}
.caixa .logo{margin:0 auto 10px;filter:brightness(0) invert(1)}
.caixa .q{font-size:14px;opacity:.75}
.caixa ul{list-style:none;margin:26px 0;padding:0;text-align:left}
.caixa li{display:flex;gap:12px;padding:12px 0;border-bottom:1px solid rgba(255,255,255,.08);font-size:15px}
.caixa li:before{content:"✓";flex:none;display:grid;place-items:center;width:22px;height:22px;border-radius:50%;background:rgba(34,197,94,.15);color:#4ade80;font-weight:800;font-size:12px}
.caixa .de{font-size:18px;opacity:.7}
.caixa .valor{font-size:92px;font-weight:800;line-height:1;letter-spacing:-.05em;margin:6px 0 4px}
.caixa .valor small{font-size:28px;vertical-align:top;margin-right:6px;letter-spacing:0}
.caixa .valor sup{font-size:32px}
.caixa .ec{display:inline-block;margin-bottom:24px;font-size:13px;font-weight:800;background:rgba(255,56,92,.16);color:#ff8fa3;border-radius:999px;padding:6px 14px}
.caixa .seguro{font-size:12px;opacity:.55;margin-top:16px}
.caixa .cd{justify-content:center;margin:22px 0 4px}

/* versão curta */
.s.curta{padding:56px 0 8px}
.topicos{list-style:none;padding:0;margin:24px 0 0;display:grid;gap:10px;max-width:760px}
.topicos li{display:flex;gap:14px;align-items:flex-start;background:#fff;border:1px solid var(--linha);border-radius:18px;padding:14px 16px;font-weight:600}
.topicos li:before{content:"✓";flex:none;display:grid;place-items:center;width:26px;height:26px;border-radius:50%;background:var(--grad);color:#fff;font-size:13px;font-weight:800}
.relato{margin:24px 0 0;max-width:760px;border-left:3px solid var(--coral);padding:4px 0 4px 18px}
.relato blockquote{margin:0;font-family:"Instrument Serif",serif;font-style:italic;font-size:22px;line-height:1.3}
.relato figcaption{font-size:13px;color:var(--tinta2);margin-top:8px}
.minibio{background:var(--noite);color:#fff;padding:22px 0}
.minibio .wrap{display:flex;align-items:center;gap:16px}
.minibio img{width:64px;height:64px;object-fit:cover;object-position:top;border-radius:50%;flex:none;background:#000}
.minibio b{display:block;font-size:16px}
.minibio span{display:block;font-size:13px;opacity:.7;line-height:1.5}
.curta-pag .ingresso{padding-top:40px}
/* professor */
.prof{background:#000}
.prof .wrap{display:grid;gap:24px;align-items:center}
@media(min-width:860px){.prof .wrap{grid-template-columns:1.05fr 1fr;gap:32px}}
.prof .foto{width:100%;max-width:560px;margin:0 auto;border-radius:22px}
.prof .bio{background:#fff;color:#111;border-radius:24px;padding:28px 22px}
@media(min-width:860px){.prof .bio{padding:40px}}
.prof .tag{display:inline-block;border:1px solid var(--coral);background:#ffe4e6;color:#333;border-radius:999px;padding:4px 26px;font-size:15px}
.prof h2{font-size:clamp(34px,4vw,44px);font-weight:800;margin:16px 0 12px}
.prof .resumo{font-size:17px;color:#333;margin:0 0 18px}
.prof ul{list-style:none;margin:0 0 20px;padding:0}
.prof li{display:flex;align-items:center;gap:14px;background:linear-gradient(90deg,var(--coral),var(--rosa));color:#fff;font-weight:700;font-size:15px;border-radius:999px;padding:12px 22px;margin-bottom:9px}
.prof li:before{content:"✓";flex:none;display:grid;place-items:center;width:26px;height:26px;border-radius:50%;background:#fff;color:#111;font-size:14px;font-weight:800}
.prof .frase{font-size:17px;color:#333;margin:0}

/* faq */
.faq{max-width:760px;margin:40px auto 0}
details{border-bottom:1px solid var(--linha);padding:4px 0}
summary{cursor:pointer;list-style:none;display:flex;justify-content:space-between;align-items:center;gap:16px;padding:20px 4px;font-size:18px;font-weight:700}
summary::-webkit-details-marker{display:none}
summary i{flex:none;width:34px;height:34px;border-radius:50%;display:grid;place-items:center;background:var(--creme);color:var(--rosa);font-style:normal;font-size:20px;transition:transform .35s,background .35s,color .35s}
details[open] summary i{transform:rotate(45deg);background:var(--rosa);color:#fff}
details .r{overflow:hidden;color:var(--tinta2);padding:0 4px}
details .r p{margin:0 0 20px}
details a{color:var(--rosa);font-weight:600;text-decoration:underline;text-underline-offset:2px}

/* cta final */
.final{background:var(--grad);color:#fff;text-align:center;overflow:hidden}
.final h2{font-size:clamp(34px,6vw,64px);font-weight:800;max-width:900px;margin:0 auto 18px}
.final p{opacity:.9;font-size:18px;margin:0 0 30px}
.final .btn{background:#fff;color:var(--rosa);box-shadow:0 20px 40px -18px rgba(0,0,0,.45)}
.final .btn:after{background:linear-gradient(105deg,transparent 35%,rgba(255,56,92,.18) 50%,transparent 65%)}
.final .cd{justify-content:center;margin-top:30px}
footer{background:var(--noite);color:#9a96a0;font-size:13px;padding-bottom:90px}
@media(min-width:860px){footer{padding-bottom:0}}
footer .wrap{display:flex;flex-wrap:wrap;justify-content:space-between;gap:12px;padding-top:26px;padding-bottom:26px}
footer a{color:#ddd;text-decoration:none;margin-right:16px}

/* barra fixa de compra (celular) */
.barra{position:fixed;left:12px;right:12px;bottom:calc(12px + env(safe-area-inset-bottom));z-index:55;display:flex;align-items:center;justify-content:space-between;gap:12px;background:rgba(14,13,16,.94);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);color:#fff;border-radius:20px;padding:10px 10px 10px 16px;box-shadow:0 20px 40px -12px rgba(0,0,0,.5);transform:translateY(160%);transition:transform .45s cubic-bezier(.2,.8,.2,1)}
.barra.on{transform:none}
.barra .pr{line-height:1.15}
.barra .pr small{display:block;font-size:11px;opacity:.6}
.barra .pr b{font-size:22px}
.barra .btn{padding:13px 18px;font-size:15px}
@media(min-width:860px){.barra{display:none}}

/* revelar ao rolar */
.rv{opacity:0;transform:translateY(28px);transition:opacity .8s cubic-bezier(.2,.8,.2,1),transform .8s cubic-bezier(.2,.8,.2,1);transition-delay:var(--d,0s)}
.rv.vis{opacity:1;transform:none}
.palavra{display:inline-block;opacity:0;transform:translateY(.4em);filter:blur(6px);transition:opacity .7s,transform .7s cubic-bezier(.2,.8,.2,1),filter .7s;transition-delay:var(--d,0s)}
.vis .palavra{opacity:1;transform:none;filter:none}

@media (prefers-reduced-motion: reduce){
  *,*:before,*:after{animation:none!important;transition:none!important;scroll-behavior:auto!important}
  .rv,.palavra,.msg{opacity:1!important;transform:none!important;filter:none!important}
  .risca:after,.tl:after{transform:rotate(-8deg) scaleX(1)!important}
  .tl:after{transform:none!important}
}
</style>
${pixel}
</head>
<body class="${longa ? "" : "curta-pag"}">
<div class="prog-bar" id="prog"></div>

<div class="topo"><div class="wrap">
  <div class="t1">Turma de <b>${esc(t.sabadoCurto)} e ${esc(t.domingoCurto)}</b><br>começa em</div>
  ${contador("topo")}
  <div class="chip">${precoDe} <b>R$ ${PRECO.por}</b> <a href="#ingresso">Garantir</a></div>
</div></div>

<header class="hero">
  <div class="aurora" aria-hidden="true"><i></i><i></i><i></i></div>
  <div class="wrap grid">
    <div class="txt">
      <span class="selo-top rv"><span class="dot"></span>Imersão online · ${esc(t.dias)}</span>
      <img class="logo rv" style="--d:.05s" src="${A}/logo.svg" alt="Imersão Chuva de Reservas" width="158" height="81">
      <h1 class="rv vis-palavras">${palavras("Seu anúncio no")} <span class="palavra serif grad-txt" style="--d:.36s">topo</span> ${palavras("do ranking do Airbnb", 0.42)} <span class="palavra serif" style="--d:.8s">em um fim de semana.</span></h1>
      <p class="sub rv" style="--d:.5s">Dois dias, sábado e domingo, das ${esc(t.horario)}, aprendendo o que o algoritmo do Airbnb quer ver e montando o anúncio que aparece nas buscas, cobra o preço certo e enche o calendário.</p>
      <div class="oferta rv" style="--d:.6s">
        <div class="preco"><span class="de">de ${precoDe}</span><span class="por">por</span><span class="valor"><small>R$</small>${PRECO.por}</span></div>
        <span class="tag-off">${DESCONTO}% OFF</span>
      </div>
      <div class="rv" style="--d:.7s">${botao("Garantir meu ingresso", "grande")}</div>
      <div class="confia rv" style="--d:.8s"><span>Pagamento seguro Eduzz</span><span>Reembolso em 7 dias</span><span>Assista no computador ou no celular</span></div>
    </div>
    <div class="foto rv" style="--d:.2s" data-parallax>
      <div class="pw">
        <img class="p" src="${A}/hero-celular.webp" alt="Rômulo Villela" width="850" height="840" fetchpriority="high">
        <div class="mg" aria-hidden="true"><i class="ft"></i><div><b>Maragogi</b><span>Espaço inteiro hospedado por Rômulo</span><hr><span>Alagoas</span></div></div>
      </div>
      <div class="float f1"><span class="ic">🔍</span><div>Topo das buscas<small>anúncio otimizado</small></div></div>
      <div class="float f2"><span class="ic">📅</span><div>Nova reserva<small>5 noites · instantânea</small></div></div>
      <div class="float f3"><img src="${A}/selo-preferido.webp" alt="Preferido dos hóspedes" width="454" height="170"></div>
    </div>
  </div>
  ${longa ? `<div class="ticker" aria-hidden="true"><div class="trilho">${[...TICKER, ...TICKER].map((x) => `<span>${x}</span>`).join("")}</div></div>` : ""}
</header>

${longa ? `<section class="s"><div class="wrap">
  <span class="eyebrow rv">O que você vai dominar</span>
  <h2 class="titulo rv" style="--d:.08s">Cinco alavancas que separam o anúncio <span class="serif grad-txt">invisível</span> do que lota.</h2>
  <div class="bento">
    ${CARDS.map(
      (c, i) => `<article class="card rv" style="--d:${(i % 3) * 0.08}s" data-tilt>
      <div class="im"><img src="${A}/${c.img}.webp" alt="" loading="lazy"></div>
      <div class="c">
        <div class="n">${String(i + 1).padStart(2, "0")}</div>
        <h3>${c.titulo}</h3>
        <div class="sub">${c.sub}</div>
        <p>${c.texto}</p>
        <span class="sai">Você sai com: ${c.sai}</span>
      </div>
    </article>`
    ).join("\n    ")}
  </div>
  <div class="numeros">
    ${NUMEROS.map(
      (n, i) => `<div class="num rv" style="--d:${i * 0.08}s"><b data-conta="${n.valor}" data-pre="${n.prefixo}" data-suf="${n.sufixo}">${n.prefixo}${n.valor.toLocaleString("pt-BR")}${n.sufixo}</b><span>${n.rotulo}</span></div>`
    ).join("\n    ")}
  </div>
</div></section>` : ""}

${longa ? `<section class="s segredos"><div class="wrap">
  <span class="eyebrow rv" style="color:var(--coral)">Direto da última turma</span>
  <h2 class="titulo rv" style="--d:.08s">${SEGREDOS.length} coisas que você vai sair sabendo sobre <span class="serif grad-txt">ranquear</span> no Airbnb.</h2>
  <div class="lista-seg">
    ${SEGREDOS.map((x, i) => `<div class="seg rv" style="--d:${(i % 2) * 0.08}s"><div><h3>${x.t}</h3><p>${x.d}</p></div></div>`).join("\n    ")}
  </div>
  <blockquote class="fala rv">“${FALAS[0]}”<cite>RÔMULO VILLELA</cite></blockquote>
</div></section>` : ""}

${longa ? `<section class="s"><div class="wrap chat-wrap">
  <div>
    <span class="eyebrow rv">Quem já participou</span>
    <h2 class="titulo rv" style="--d:.08s">Teve gente reservando <span class="serif grad-txt">durante</span> a imersão.</h2>
    <p class="lead rv" style="--d:.16s">Mensagens do chat da última turma, enquanto a aula acontecia.</p>
    <ul class="pq rv" style="--d:.24s">${PARA_QUEM.map((x) => `<li>${x}</li>`).join("")}</ul>
  </div>
  <div class="janela rv" style="--d:.1s">
    <div class="bar"><i></i><i></i><i></i><em>Chat da imersão</em><span class="ao">${CHAT.length} mensagens</span></div>
    <div class="msgs" data-chat>
      ${CHAT.map((m) => `<div class="msg"><b>${esc(m.nome)}${m.cidade ? ` · ${esc(m.cidade)}` : ""}</b>${esc(m.texto)}</div>`).join("\n      ")}
      <div class="digitando"><i></i><i></i><i></i></div>
    </div>
  </div>
</div></section>` : ""}

${longa ? `<section class="s" style="background:var(--creme)"><div class="wrap">
  <span class="eyebrow rv">Programação</span>
  <h2 class="titulo rv" style="--d:.08s">Dois dias. <span class="serif">Um anúncio</span> pronto pra competir.</h2>
  <div class="dias">
    ${(["sabado", "domingo"] as const)
      .map((k, i) => {
        const d = PROGRAMACAO[k];
        return `<div class="dia rv" style="--d:${i * 0.1}s">
      <div class="q"><b>${k === "sabado" ? "Sábado" : "Domingo"}</b><span>${esc(k === "sabado" ? t.sabadoCurto : t.domingoCurto)}</span></div>
      <h3>${d.tema}</h3>
      <ul class="tl">${d.topicos.map((x) => `<li>${x}</li>`).join("")}</ul>
      <div class="horas"><span>Manhã 9h–12h</span><span>Almoço 12h–13h30</span><span>Tarde 13h30–16h</span></div>
    </div>`;
      })
      .join("\n    ")}
  </div>
  <blockquote class="fala rv" style="color:var(--tinta)">“${FALAS[1]}”<cite>RÔMULO VILLELA</cite></blockquote>
</div></section>` : ""}

${longa ? "" : `<section class="s curta"><div class="wrap">
  <h2 class="titulo rv">Em 2 dias você <span class="serif grad-txt">aprende</span>:</h2>
  <ul class="topicos">
    ${CURTA_TOPICOS.map((x, i) => `<li class="rv" style="--d:${i * 0.06}s">${x}</li>`).join("")}
  </ul>
  <figure class="relato rv"><blockquote>“${esc(CHAT[0].texto)}”</blockquote><figcaption>${esc(CHAT[0].nome)} · ${esc(CHAT[0].cidade)}, na última turma</figcaption></figure>
</div></section>`}

<section class="s ingresso" id="ingresso"><div class="wrap">
  <span class="eyebrow rv" style="display:flex;justify-content:center">Ingresso</span>
  <h2 class="titulo c rv" style="--d:.08s;text-align:center">Garanta seu lugar na turma de <span class="serif grad-txt">${esc(t.dias)}</span>.</h2>
  <div class="caixa-borda rv" style="--d:.15s"><div class="caixa">
    <img class="logo" src="${A}/logo.svg" alt="" width="158" height="81">
    <div class="q">${quando} · 100% online</div>
    <ul>
      <li>2 dias de imersão: sábado e domingo, das ${esc(t.horario)}</li>
      <li>Anúncio, preço, algoritmo, métricas e avaliações</li>
      <li>Análise de anúncios reais, com as métricas de cada um</li>
      <li>Dá pra assistir no computador ou no celular (melhor no computador)</li>
    </ul>
    <div class="de">de ${precoDe} por</div>
    <div class="valor"><small>R$</small>${PRECO.por}</div>
    <span class="ec">Economia de R$ ${PRECO.de - PRECO.por} · ${DESCONTO}% OFF</span>
    <div>${botao("Garantir meu ingresso", "grande")}</div>
    ${contador("caixa")}
    <div class="seguro">Pagamento seguro pela Eduzz · reembolso em até 7 dias</div>
  </div></div>
</div></section>

${longa ? "" : `<section class="minibio"><div class="wrap">
  <img src="${A}/romulo.webp" alt="Rômulo Villela" loading="lazy" width="606" height="804">
  <div><b>Com Rômulo Villela</b><span>${BIO.destaques.join(" · ")}</span></div>
</div></section>`}

${longa ? `<section class="s prof"><div class="wrap">
  <img class="foto rv" src="${A}/romulo.webp" alt="Rômulo Villela" loading="lazy" width="606" height="804">
  <div class="bio rv" style="--d:.1s">
    <span class="tag">Quem será seu professor</span>
    <h2>Prazer, Rômulo Villela</h2>
    <p class="resumo">${BIO.resumo}</p>
    <ul>
      ${BIO.destaques.map((d) => `<li>${d}</li>`).join("\n      ")}
    </ul>
    <p class="frase">“${BIO.frase}”</p>
  </div>
</div></section>` : ""}

${longa ? `<section class="s"><div class="wrap">
  <span class="eyebrow rv" style="display:flex;justify-content:center">Dúvidas</span>
  <h2 class="titulo c rv" style="--d:.08s;text-align:center">Perguntas frequentes</h2>
  <div class="faq">
    ${(longa ? faq : faq.filter((f) => FAQ_CURTA.includes(f.p))).map((f, i) => `<details class="rv" style="--d:${i * 0.05}s"><summary>${f.p}<i>+</i></summary><div class="r"><p>${f.r}</p></div></details>`).join("\n    ")}
  </div>
</div></section>` : ""}

${longa ? `<section class="s final"><div class="wrap">
  <h2 class="rv">Seu próximo fim de semana pode encher o seu <span class="serif">calendário.</span></h2>
  <p class="rv" style="--d:.1s">${quando}. De R$ ${PRECO.de} por <b>R$ ${PRECO.por}</b>.</p>
  <div class="rv" style="--d:.2s">${botao("Quero meu ingresso", "grande")}</div>
  ${contador("final")}
</div></section>` : ""}

<footer><div class="wrap">
  <div>Imersão Chuva de Reservas no seu Airbnb</div>
  <div><a href="${SUPORTE_WHATSAPP.link}" target="_blank" rel="noopener">Suporte no WhatsApp ${SUPORTE_WHATSAPP.texto}</a><a href="https://www.instagram.com/romulovillela/" rel="noopener">Instagram</a><a href="https://www.youtube.com/@romulovillela" rel="noopener">YouTube</a>© ${new Date().getFullYear()} Canal do Anfitrião</div>
</div></footer>

<div class="barra" id="barra" aria-hidden="true">
  <div class="pr"><small>de ${precoDe} por</small><b>R$ ${PRECO.por}</b></div>
  ${botao("Garantir")}
</div>

<script>
(function(){
var reduz = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
var alvo = new Date(${JSON.stringify(t.inicioSabado)}).getTime();
function p(n){return n<10?'0'+n:''+n}
var cds = document.querySelectorAll('[data-cd]');
function tick(){
  var s=Math.max(0,Math.floor((alvo-Date.now())/1000));
  var v={d:Math.floor(s/86400),h:Math.floor(s%86400/3600),m:Math.floor(s%3600/60),s:s%60};
  cds.forEach(function(c){c.querySelectorAll('[data-u]').forEach(function(b){b.textContent=p(v[b.getAttribute('data-u')])})});
}
tick(); setInterval(tick,1000);

// revelar ao rolar
var io = new IntersectionObserver(function(es){es.forEach(function(e){if(e.isIntersecting){e.target.classList.add('vis');io.unobserve(e.target);if(e.target.hasAttribute('data-chat-host'))chat();}})},{threshold:.18,rootMargin:'0px 0px -40px 0px'});
document.querySelectorAll('.rv,.oferta,.caixa,.dia').forEach(function(el){io.observe(el)});

// contadores
var io2 = new IntersectionObserver(function(es){es.forEach(function(e){if(!e.isIntersecting)return;io2.unobserve(e.target);
  var el=e.target,fim=+el.getAttribute('data-conta'),pre=el.getAttribute('data-pre')||'',suf=el.getAttribute('data-suf')||'';
  if(reduz){return}
  var t0=null,dur=1400;
  function f(ts){if(!t0)t0=ts;var k=Math.min(1,(ts-t0)/dur);k=1-Math.pow(1-k,3);el.textContent=pre+Math.round(fim*k).toLocaleString('pt-BR')+suf;if(k<1)requestAnimationFrame(f)}
  requestAnimationFrame(f);
})},{threshold:.5});
document.querySelectorAll('[data-conta]').forEach(function(el){io2.observe(el)});

// chat que "digita"
var caixaChat=document.querySelector('[data-chat]');
if(caixaChat){
  var host=caixaChat.closest('.janela'); host.setAttribute('data-chat-host','');
  var msgs=caixaChat.querySelectorAll('.msg'), dig=caixaChat.querySelector('.digitando'), feito=false;
  window.chat=function(){if(feito)return;feito=true;
    if(reduz){msgs.forEach(function(m){m.classList.add('on')});return}
    var i=0;(function prox(){if(i>=msgs.length){dig.classList.remove('on');return}
      dig.classList.add('on');caixaChat.insertBefore(dig,msgs[i]);
      setTimeout(function(){dig.classList.remove('on');msgs[i].classList.add('on');i++;setTimeout(prox,350)},700);
    })();
  };
  var chat=window.chat;
}

// tilt nos cards (só mouse)
if(!reduz && window.matchMedia('(hover:hover) and (pointer:fine)').matches){
  document.querySelectorAll('[data-tilt]').forEach(function(c){
    c.addEventListener('mousemove',function(e){var r=c.getBoundingClientRect(),x=(e.clientX-r.left)/r.width-.5,y=(e.clientY-r.top)/r.height-.5;c.style.transform='perspective(900px) rotateX('+(-y*5)+'deg) rotateY('+(x*6)+'deg) translateY(-4px)'});
    c.addEventListener('mouseleave',function(){c.style.transform=''});
  });
  var foto=document.querySelector('[data-parallax]');
  if(foto)window.addEventListener('mousemove',function(e){var x=e.clientX/innerWidth-.5,y=e.clientY/innerHeight-.5;foto.style.transform='translate3d('+(x*-14)+'px,'+(y*-10)+'px,0)'},{passive:true});
}

// progresso + barra fixa
var prog=document.getElementById('prog'), barra=document.getElementById('barra'), hero=document.querySelector('.hero'), ing=document.getElementById('ingresso');
function rolar(){
  var h=document.documentElement, k=h.scrollTop/(h.scrollHeight-h.clientHeight||1);
  prog.style.transform='scaleX('+k+')';
  var passouHero=hero.getBoundingClientRect().bottom<0, r=ing.getBoundingClientRect(), naCaixa=r.top<innerHeight&&r.bottom>0;
  barra.classList.toggle('on',passouHero&&!naCaixa);
}
addEventListener('scroll',rolar,{passive:true}); rolar();

// rastreamento: /t/pv ao carregar; no clique em comprar, InitiateCheckout no
// pixel + /t/click e só então segue pro checkout (com todos os parâmetros da URL)
var turma=${JSON.stringify(t.turma)}, variante=${JSON.stringify(variante)};
function beacon(rota,extra){
  var d={u:location.search,ref:document.referrer||'',turma:turma,variante:variante};
  if(extra)for(var k in extra)d[k]=extra[k];
  var b=JSON.stringify(d);
  try{if(navigator.sendBeacon&&navigator.sendBeacon(rota,new Blob([b],{type:'text/plain'})))return}catch(e){}
  try{fetch(rota,{method:'POST',body:b,keepalive:true,headers:{'Content-Type':'text/plain'}})}catch(e){}
}
beacon('/t/pv');
document.addEventListener('click',function(e){
  var a=e.target.closest&&e.target.closest('[data-comprar]');
  if(!a||e.defaultPrevented||e.button!==0||e.metaKey||e.ctrlKey||e.shiftKey)return;
  e.preventDefault();
  var href=a.getAttribute('href');
  try{if(window.fbq)fbq('track','InitiateCheckout',{value:${PRECO.por},currency:'BRL',content_name:'Imersão Chuva de Reservas',content_category:variante})}catch(x){}
  beacon('/t/click',{destino:href});
  setTimeout(function(){location.href=href},350);
});

// FAQ: abre/fecha suave
document.querySelectorAll('details').forEach(function(d){
  var r=d.querySelector('.r');
  d.querySelector('summary').addEventListener('click',function(e){
    if(reduz)return; e.preventDefault();
    if(d.open){var h=r.scrollHeight;r.animate([{height:h+'px',opacity:1},{height:'0px',opacity:0}],{duration:280,easing:'ease'}).onfinish=function(){d.open=false};}
    else{d.open=true;var h2=r.scrollHeight;r.animate([{height:'0px',opacity:0},{height:h2+'px',opacity:1}],{duration:320,easing:'cubic-bezier(.2,.8,.2,1)'});}
  });
});
})();
</script>
</body>
</html>`;
}

/** Quebra um texto em palavras que entram uma a uma (h1 do hero). */
function palavras(txt: string, atrasoInicial = 0): string {
  return txt
    .split(" ")
    .map((w, i) => `<span class="palavra" style="--d:${(atrasoInicial + i * 0.06).toFixed(2)}s">${w}</span>`)
    .join(" ");
}
