// Página única (HTML + CSS + JS, sem dependências) com todas as conversas do
// Téo, no visual do WhatsApp: lista de conversas e a conversa aberta. No
// celular é uma tela de cada vez; em tela larga, as duas lado a lado.
// Os dados entram embutidos como JSON, então o arquivo abre sozinho, offline.

export type MsgExport = {
  /** data ISO */
  d: string;
  /** c = lead, t = Téo, h = alguém do time, a = automação, p = aviso da plataforma, n = nota interna */
  s: "c" | "t" | "h" | "a" | "p" | "n";
  /** texto (já com o corpo do template, quando for template) */
  tx: string | null;
  /** tipo do Unnichat (message, audio, image, template, flow, note…) */
  ty: string;
  /** mídia */
  u?: string | null;
  /** transcrição do áudio, se o Téo já ouviu */
  tr?: string | null;
};

export type ConversaExport = {
  id: string;
  nome: string;
  telefone: string | null;
  estado: string | null;
  respostas: number;
  ficha: string | null;
  humano: string | null;
  vendedor: string | null;
  calls: { inicio: string; vendedor: string | null; status: string }[];
  msgs: MsgExport[];
  erro?: string;
};

export function paginaConversas(conversas: ConversaExport[], geradoEm: Date): string {
  const dados = JSON.stringify({ conversas, geradoEm: geradoEm.toISOString() })
    .replace(/</g, "\\u003c")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="robots" content="noindex">
<title>Conversas do Téo</title>
<style>
:root{
  --verde:#008069;--verde-esc:#075e54;--fundo:#efeae2;--lista:#ffffff;--linha:#e9edef;
  --txt:#111b21;--sub:#667781;--in:#ffffff;--out:#d9fdd3;--pill:#ffffff;--sys:#ffeecd;--sys-txt:#54656f;
  --nota:#fff7d6;--nota-borda:#f0d98c;--chip:#f0f2f5;--chip-on:#d9fdd3;--chip-on-txt:#008069;
  --busca:#f0f2f5;--sombra:0 1px .5px rgba(11,20,26,.13);--teo:#008069;--time:#6b4fbb;--auto:#8696a0;
  --padrao:rgba(0,0,0,.035);
}
@media (prefers-color-scheme:dark){
  :root{
    --verde:#00a884;--verde-esc:#202c33;--fundo:#0b141a;--lista:#111b21;--linha:#222d34;
    --txt:#e9edef;--sub:#8696a0;--in:#202c33;--out:#005c4b;--pill:#182229;--sys:#182229;--sys-txt:#8696a0;
    --nota:#2a2715;--nota-borda:#5c5221;--chip:#202c33;--chip-on:#0a332c;--chip-on-txt:#00a884;
    --busca:#202c33;--sombra:0 1px .5px rgba(0,0,0,.3);--teo:#00a884;--time:#a990f5;--auto:#8696a0;
    --padrao:rgba(255,255,255,.025);
  }
}
*{box-sizing:border-box;margin:0;padding:0}
html,body{height:100%}
body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;background:var(--lista);color:var(--txt);font-size:15px;-webkit-text-size-adjust:100%}
#app{display:flex;height:100dvh;overflow:hidden}
#lista{width:100%;display:flex;flex-direction:column;background:var(--lista);border-right:1px solid var(--linha)}
#chat{display:none;flex:1;flex-direction:column;min-width:0;background:var(--fundo);
  background-image:radial-gradient(var(--padrao) 1.2px,transparent 1.2px);background-size:18px 18px}
body.aberto #lista{display:none}
body.aberto #chat{display:flex}
@media (min-width:900px){
  #lista{width:380px;flex:none;display:flex!important}
  #chat{display:flex}
  .voltar{display:none!important}
}
.topo{background:var(--verde-esc);color:#fff;padding:12px 16px;padding-top:max(12px,env(safe-area-inset-top));display:flex;align-items:center;gap:12px;min-height:60px}
@media (prefers-color-scheme:dark){.topo{color:var(--txt)}}
.topo h1{font-size:19px;font-weight:600}
.topo .info{font-size:12px;opacity:.8;margin-top:2px}
.busca{padding:8px 12px;background:var(--lista)}
.busca input{width:100%;border:0;border-radius:8px;background:var(--busca);color:var(--txt);padding:9px 14px;font-size:15px;outline:none}
.chips{display:flex;gap:8px;padding:2px 12px 10px;overflow-x:auto;scrollbar-width:none}
.chips::-webkit-scrollbar{display:none}
.chip{flex:none;border:0;border-radius:16px;background:var(--chip);color:var(--sub);padding:6px 12px;font-size:14px;cursor:pointer}
.chip.on{background:var(--chip-on);color:var(--chip-on-txt);font-weight:600}
#itens{overflow-y:auto;flex:1}
.item{display:flex;gap:12px;padding:10px 16px;cursor:pointer;align-items:center}
.item:hover{background:var(--busca)}
.item.sel{background:var(--busca)}
.av{flex:none;width:48px;height:48px;border-radius:50%;display:grid;place-items:center;color:#fff;font-weight:600;font-size:18px}
.corpo{flex:1;min-width:0;border-bottom:1px solid var(--linha);padding-bottom:10px;margin-bottom:-10px}
.l1{display:flex;justify-content:space-between;gap:8px;align-items:baseline}
.nome{font-size:16px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.hora{font-size:12px;color:var(--sub);flex:none}
.l2{display:flex;justify-content:space-between;gap:8px;margin-top:3px;align-items:center}
.prev{font-size:14px;color:var(--sub);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.tags{display:flex;gap:4px;flex:none}
.tag{font-size:11px;border-radius:10px;padding:1px 7px;background:var(--chip);color:var(--sub);white-space:nowrap}
.tag.call{background:var(--chip-on);color:var(--chip-on-txt)}
.vazio{padding:40px 20px;text-align:center;color:var(--sub)}
.voltar{background:none;border:0;color:inherit;font-size:24px;line-height:1;cursor:pointer;padding:4px 6px 4px 0}
#cab .av{width:40px;height:40px;font-size:16px}
#cab .nome{font-size:16px;font-weight:600}
#cab .sub{font-size:12px;opacity:.8;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
#cab .txt{min-width:0;flex:1;cursor:pointer}
#msgs{flex:1;overflow-y:auto;padding:12px 4% 24px;display:flex;flex-direction:column;gap:2px}
.dia{align-self:center;background:var(--pill);color:var(--sub);font-size:12.5px;padding:5px 12px;border-radius:8px;margin:10px 0 6px;box-shadow:var(--sombra);text-transform:uppercase}
.sys{align-self:center;background:var(--sys);color:var(--sys-txt);font-size:12.5px;padding:5px 12px;border-radius:8px;margin:4px 0;text-align:center;max-width:90%;box-shadow:var(--sombra)}
.nota{align-self:center;background:var(--nota);border:1px solid var(--nota-borda);font-size:13.5px;padding:8px 12px;border-radius:8px;margin:6px 0;max-width:92%;white-space:pre-wrap;word-wrap:break-word}
.nota b{display:block;font-size:11.5px;color:var(--sub);margin-bottom:3px}
.b{max-width:min(80%,560px);padding:6px 8px 4px 9px;border-radius:8px;box-shadow:var(--sombra);margin-top:2px;position:relative;word-wrap:break-word;overflow-wrap:anywhere}
.b.in{align-self:flex-start;background:var(--in);border-top-left-radius:0}
.b.out{align-self:flex-end;background:var(--out);border-top-right-radius:0}
.b.cont{border-radius:8px;margin-top:1px}
.b .quem{font-size:12.5px;font-weight:600;margin-bottom:2px}
.b .quem.t{color:var(--teo)}.b .quem.h{color:var(--time)}.b .quem.a{color:var(--auto)}
.b .t{white-space:pre-wrap;font-size:14.5px;line-height:1.38}
.b .t a{color:#027eb5}
.b .m{float:right;font-size:11px;color:var(--sub);margin:6px 0 -2px 10px}
.b .midia{font-size:14px;color:var(--sub)}
.b img{display:block;max-width:100%;max-height:320px;border-radius:6px;margin:2px 0 4px}
.b audio{width:240px;max-width:100%;height:36px;margin:2px 0}
.b .tr{font-size:13.5px;font-style:italic;margin-top:2px;white-space:pre-wrap}
.ficha{display:none;background:var(--lista);border-bottom:1px solid var(--linha);padding:10px 16px;font-size:13.5px;max-height:40vh;overflow:auto}
.ficha.on{display:block}
.ficha h3{font-size:12px;color:var(--sub);text-transform:uppercase;margin:8px 0 3px;font-weight:600}
.ficha h3:first-child{margin-top:0}
.ficha p{white-space:pre-wrap}
.boas{flex:1;display:grid;place-items:center;color:var(--sub);text-align:center;padding:20px}
.boas b{display:block;font-size:22px;color:var(--txt);font-weight:400;margin-bottom:8px}
</style>
</head>
<body>
<div id="app">
  <section id="lista">
    <header class="topo"><div><h1>Conversas do Téo</h1><div class="info" id="resumo"></div></div></header>
    <div class="busca"><input id="q" type="search" placeholder="Pesquisar nome ou telefone" autocomplete="off"></div>
    <div class="chips" id="chips"></div>
    <div id="itens"></div>
  </section>
  <section id="chat">
    <div class="boas" id="boas"><div><b>Conversas do Téo</b>Escolha uma conversa na lista.</div></div>
    <header class="topo" id="cab" style="display:none">
      <button class="voltar" id="voltar" aria-label="Voltar">&larr;</button>
      <div class="av" id="cabAv"></div>
      <div class="txt" id="cabTxt"><div class="nome" id="cabNome"></div><div class="sub" id="cabSub"></div></div>
    </header>
    <div class="ficha" id="ficha"></div>
    <div id="msgs" style="display:none"></div>
  </section>
</div>
<script id="dados" type="application/json">${dados}</script>
<script>
(function(){
  var D = JSON.parse(document.getElementById('dados').textContent);
  var C = D.conversas;
  var CORES = ['#00a884','#53bdeb','#ff8c42','#a78bfa','#f15c6d','#25a3a3','#e2a03f','#6b8afd','#d16fa8','#7c9a3c'];
  var FILTROS = [
    {k:'todas', l:'Todas'},
    {k:'call', l:'Com call'},
    {k:'resp', l:'Lead respondeu'},
    {k:'humano', l:'Passou pro time'},
    {k:'sem', l:'Sem resposta'}
  ];
  var filtro = 'todas', busca = '', atual = null;

  function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
  function linkify(s){return esc(s).replace(/(https?:\\/\\/[^\\s<]+)/g,'<a href="$1" target="_blank" rel="noopener">$1</a>').replace(/\\*([^*\\n]+)\\*/g,'<b>$1</b>');}
  function cor(id){var h=0;for(var i=0;i<id.length;i++)h=(h*31+id.charCodeAt(i))>>>0;return CORES[h%CORES.length];}
  function ini(n){var p=String(n||'?').trim().split(/\\s+/);return ((p[0]||'?')[0]+((p[1]||'')[0]||'')).toUpperCase();}
  var fmtH = new Intl.DateTimeFormat('pt-BR',{hour:'2-digit',minute:'2-digit',timeZone:'America/Sao_Paulo'});
  var fmtD = new Intl.DateTimeFormat('pt-BR',{day:'2-digit',month:'2-digit',year:'numeric',timeZone:'America/Sao_Paulo'});
  var fmtDL = new Intl.DateTimeFormat('pt-BR',{weekday:'long',day:'2-digit',month:'long',timeZone:'America/Sao_Paulo'});
  var fmtCall = new Intl.DateTimeFormat('pt-BR',{weekday:'short',day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit',timeZone:'America/Sao_Paulo'});
  function diaKey(d){return fmtD.format(new Date(d));}
  function horaLista(d){
    if(!d) return '';
    var x=new Date(d), hoje=diaKey(new Date()), ontem=diaKey(new Date(Date.now()-864e5)), k=diaKey(x);
    if(k===hoje) return fmtH.format(x);
    if(k===ontem) return 'Ontem';
    return k.slice(0,5);
  }
  function previa(m){
    if(!m) return '';
    var p = m.s==='t'?'Téo: ':m.s==='h'?'Time: ':m.s==='a'?'Auto: ':'';
    var t = m.tx || (/audio|ptt/.test(m.ty)?'🎤 Áudio':/image|sticker/.test(m.ty)?'📷 Imagem':/video/.test(m.ty)?'🎥 Vídeo':/document/.test(m.ty)?'📄 Arquivo':'['+m.ty+']');
    return p + t.replace(/\\s+/g,' ');
  }
  C.forEach(function(c){
    var vis = c.msgs.filter(function(m){return m.s!=='p'&&m.s!=='n';});
    c._ult = vis.length ? vis[vis.length-1] : (c.msgs[c.msgs.length-1]||null);
    c._leadResp = c.msgs.some(function(m){return m.s==='c' && !/^(Confirmar|Sim|Não)$/i.test((m.tx||'').trim());});
    c._busca = (c.nome+' '+(c.telefone||'')).toLowerCase();
  });
  C.sort(function(a,b){return String(b._ult&&b._ult.d||'').localeCompare(String(a._ult&&a._ult.d||''));});

  function passa(c){
    if(busca){
      var dig = busca.replace(/\\D/g,'');
      var achou = c._busca.indexOf(busca)>=0 || (dig.length>=3 && c._busca.replace(/\\D/g,'').indexOf(dig)>=0);
      if(!achou) return false;
    }
    if(filtro==='call') return c.calls.length>0;
    if(filtro==='resp') return c._leadResp;
    if(filtro==='humano') return !!c.humano;
    if(filtro==='sem') return !c._leadResp;
    return true;
  }
  function chips(){
    document.getElementById('chips').innerHTML = FILTROS.map(function(f){
      var n = C.filter(function(c){var o=filtro;filtro=f.k;var r=passa(c);filtro=o;return r;}).length;
      return '<button class="chip'+(f.k===filtro?' on':'')+'" data-f="'+f.k+'">'+f.l+' · '+n+'</button>';
    }).join('');
  }
  function lista(){
    chips();
    var v = C.filter(passa);
    document.getElementById('itens').innerHTML = v.length ? v.map(function(c){
      var tags = '';
      if(c.calls.length) tags += '<span class="tag call">📅 '+c.calls.filter(function(k){return k.status!=='cancelada';}).length+' call</span>';
      if(c.humano) tags += '<span class="tag">👤 time</span>';
      return '<div class="item'+(atual&&atual.id===c.id?' sel':'')+'" data-id="'+esc(c.id)+'">'+
        '<div class="av" style="background:'+cor(c.id)+'">'+esc(ini(c.nome))+'</div>'+
        '<div class="corpo"><div class="l1"><div class="nome">'+esc(c.nome)+'</div><div class="hora">'+esc(horaLista(c._ult&&c._ult.d))+'</div></div>'+
        '<div class="l2"><div class="prev">'+esc(previa(c._ult))+'</div><div class="tags">'+tags+'</div></div></div></div>';
    }).join('') : '<div class="vazio">Nenhuma conversa com esse filtro.</div>';
  }
  function bolha(m, prev){
    var out = m.s==='t'||m.s==='h'||m.s==='a';
    var mesmo = prev && prev.s===m.s && diaKey(prev.d)===diaKey(m.d);
    var quem = '';
    if(out && !mesmo) quem = '<div class="quem '+m.s+'">'+(m.s==='t'?'Téo 🤖':m.s==='h'?'Time':'Automação')+(m.ty==='template'?' · modelo':m.ty==='flow'?' · fluxo':'')+'</div>';
    var corpo = '';
    if(/audio|ptt/.test(m.ty)){
      corpo = '<div class="midia">🎤 Áudio</div>'+(m.u?'<audio controls preload="none" src="'+esc(m.u)+'"></audio>':'')+(m.tr?'<div class="tr">“'+esc(m.tr)+'”</div>':'');
    } else if(/image|sticker/.test(m.ty) && m.u){
      corpo = '<a href="'+esc(m.u)+'" target="_blank" rel="noopener"><img loading="lazy" src="'+esc(m.u)+'" alt="imagem"></a>';
    } else if(/video|document/.test(m.ty) && m.u){
      corpo = '<div class="midia"><a href="'+esc(m.u)+'" target="_blank" rel="noopener">'+(/video/.test(m.ty)?'🎥 Vídeo':'📄 Arquivo')+'</a></div>';
    }
    if(m.tx) corpo += '<div class="t">'+linkify(m.tx)+'</div>';
    if(!corpo) corpo = '<div class="midia">'+(m.ty==='flow'?'⚙️ Fluxo automático':m.ty==='template'?'[modelo de mensagem]':'['+esc(m.ty)+']')+'</div>';
    return '<div class="b '+(out?'out':'in')+(mesmo?' cont':'')+'">'+quem+corpo+'<span class="m">'+fmtH.format(new Date(m.d))+'</span></div>';
  }
  function abrir(id){
    atual = C.find(function(c){return c.id===id;});
    if(!atual) return;
    document.body.classList.add('aberto');
    document.getElementById('boas').style.display='none';
    document.getElementById('cab').style.display='flex';
    document.getElementById('msgs').style.display='flex';
    var av = document.getElementById('cabAv');
    av.style.background = cor(atual.id); av.textContent = ini(atual.nome);
    document.getElementById('cabNome').textContent = atual.nome;
    var sub = [atual.telefone, atual.vendedor?('vendedor: '+atual.vendedor):null, atual.calls.length?('📅 '+atual.calls.length+' call'):null].filter(Boolean).join(' · ');
    document.getElementById('cabSub').textContent = (sub||'')+' · toque pra ver a ficha';
    var f = '';
    if(atual.calls.length) f += '<h3>Calls</h3><p>'+atual.calls.map(function(k){return esc(fmtCall.format(new Date(k.inicio)))+' com '+esc(k.vendedor||'—')+' ('+esc(k.status==='cancelada'?'cancelada':'marcada')+')';}).join('\\n')+'</p>';
    if(atual.humano) f += '<h3>Passou pro time</h3><p>'+esc(atual.humano)+'</p>';
    if(atual.ficha) f += '<h3>Ficha do Téo</h3><p>'+esc(atual.ficha)+'</p>';
    f += '<h3>Situação</h3><p>'+esc(atual.estado||'—')+' · '+atual.respostas+' resposta(s) do Téo</p>';
    if(atual.erro) f += '<h3>Aviso</h3><p>Não deu pra carregar o histórico: '+esc(atual.erro)+'</p>';
    var fe = document.getElementById('ficha'); fe.innerHTML = f; fe.classList.remove('on');
    var h = '', prevDia = null, prev = null;
    atual.msgs.forEach(function(m){
      var k = diaKey(m.d);
      if(k!==prevDia){ h += '<div class="dia">'+esc(k===diaKey(new Date())?'Hoje':fmtDL.format(new Date(m.d)))+'</div>'; prevDia = k; prev = null; }
      if(m.s==='p'){ h += '<div class="sys">'+esc(m.tx)+' · '+fmtH.format(new Date(m.d))+'</div>'; prev = null; return; }
      if(m.s==='n'){ h += '<div class="nota"><b>📝 Nota interna · '+fmtH.format(new Date(m.d))+'</b>'+linkify(m.tx||'')+'</div>'; prev = null; return; }
      h += bolha(m, prev); prev = m;
    });
    if(!atual.msgs.length) h = '<div class="sys">Sem mensagens no histórico.</div>';
    var box = document.getElementById('msgs'); box.innerHTML = h; box.scrollTop = box.scrollHeight;
    lista();
    if(location.hash !== '#'+id) history.pushState({id:id}, '', '#'+id);
  }
  function fechar(){ document.body.classList.remove('aberto'); atual = null; lista(); }

  document.getElementById('resumo').textContent = C.length+' conversas · gerado em '+fmtD.format(new Date(D.geradoEm))+' '+fmtH.format(new Date(D.geradoEm));
  document.getElementById('itens').addEventListener('click', function(e){ var it = e.target.closest('.item'); if(it) abrir(it.getAttribute('data-id')); });
  document.getElementById('chips').addEventListener('click', function(e){ var b = e.target.closest('.chip'); if(b){ filtro = b.getAttribute('data-f'); lista(); } });
  document.getElementById('q').addEventListener('input', function(e){ busca = e.target.value.trim().toLowerCase(); lista(); });
  document.getElementById('voltar').addEventListener('click', function(){ if(history.state&&history.state.id) history.back(); else fechar(); });
  document.getElementById('cabTxt').addEventListener('click', function(){ document.getElementById('ficha').classList.toggle('on'); });
  window.addEventListener('popstate', function(){ var id = location.hash.slice(1); if(id) abrir(id); else fechar(); });
  lista();
  if(location.hash.length>1) abrir(location.hash.slice(1));
})();
</script>
</body>
</html>`;
}
