import type { SupabaseClient } from "@supabase/supabase-js";
import { unnichat } from "@/lib/teo";

// Entrega TMB → Eduzz/Nutror (Black Friday Histórica 2026).
//
// A TMB (parcelado em 12x) não entrega nada. Quando a entrada (1ª parcela) de
// um pedido da Black é paga, o comprador precisa ganhar na Nutror o mesmo
// pacote de quem compra na Eduzz (produto 2914907).
//
// O que é automático:
//   - receber os avisos da TMB (webhooks "Vendas" e "Financeiro"), guardar
//     todos em tmb_eventos e manter uma linha por pedido em tmb_entregas;
//   - checar se o e-mail já tem o pacote: a Eduzz manda pro painel cada
//     matrícula da Nutror (nutror.enrollment_created) e a compra direta da Black
//     já vira venda em `sales`;
//   - confirmar a entrega quando a matrícula no pacote chega;
//   - avisar o time pelo WhatsApp e rodar a varredura diária.
//
// O que NÃO dá pra automatizar: a Entrega Manual em si. A API oficial da Eduzz
// não tem esse recurso (só existe no painel da Eduzz), então o pedido fica
// "pendente" e o aviso diz exatamente o que fazer. Nada de endpoint inventado.
//
// Modo teste (tmb_config.modo_teste, começa LIGADO): faz tudo, mas em vez de
// pedir a entrega ao time, marca "simulado" e mostra o que faria.

export type TmbConfig = {
  modo_teste: boolean;
  eduzz_produto_id: string;
  pacote_nutror_hash: string;
  pacote_nutror_titulo: string;
  filtro_black: string;
  tmb_produto_id: string | null;
  black_desde: string;
  aviso_telefones: string[];
  aviso_template_id: string | null;
  ultima_varredura: string | null;
  ultima_varredura_resumo: string | null;
};

export type PedidoTmb = {
  pedidoId: string | null;
  evento: string | null;
  email: string | null;
  nome: string | null;
  telefone: string | null;
  produto: string | null;
  oferta: string | null;
  status: string | null;
  valor: number | null;
  parcela: number | null;
  // Quando o pedido foi criado/efetivado na TMB (se o aviso disser).
  dataPedido: string | null;
  produtoId: string | null;
  bruto: unknown;
};

export type Tipo = "pago" | "cancelado" | "reembolsado" | "aguardando" | "outro";

export type Origem = "webhook" | "varredura" | "simulacao" | "painel";

export type Resultado = { pedidoId: string | null; status: string; detalhe: string };

const CAMPOS_CONFIG =
  "modo_teste, eduzz_produto_id, pacote_nutror_hash, pacote_nutror_titulo, filtro_black, tmb_produto_id, black_desde, aviso_telefones, aviso_template_id, ultima_varredura, ultima_varredura_resumo";

export async function lerConfig(supabase: SupabaseClient): Promise<TmbConfig | null> {
  const { data } = await supabase.from("tmb_config").select(CAMPOS_CONFIG).eq("id", 1).maybeSingle();
  return (data as TmbConfig | null) ?? null;
}

// ---------- leitura do aviso da TMB ----------

function semAcento(s: string): string {
  return s
    .normalize("NFD")
    .split("")
    .filter((c) => {
      const code = c.charCodeAt(0);
      return code < 0x300 || code > 0x36f;
    })
    .join("");
}

function texto(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "string") return v.trim() || null;
  if (typeof v === "number") return String(v);
  if (typeof v === "object" && !Array.isArray(v)) {
    const o = v as Record<string, unknown>;
    return texto(o.nome ?? o.name ?? o.titulo ?? o.title ?? o.id);
  }
  return null;
}

function numero(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string") {
    // "1.234,56" ou "1234.56"
    const s = v.trim();
    const n = Number(s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : s);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function primeiro(...vs: unknown[]): unknown {
  for (const v of vs) if (v !== null && v !== undefined && v !== "") return v;
  return null;
}

function telefoneDe(v: unknown): string | null {
  if (Array.isArray(v)) return telefoneDe(v[0]);
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    return telefoneDe(primeiro(o.numero, o.telefone, o.phone, o.number));
  }
  const t = texto(v);
  return t ? t.replace(/[^\d+]/g, "") || null : null;
}

// Os webhooks da TMB (doc da central de ajuda):
//   Vendas:     objeto com pedido, status_pedido (Efetivado = entrada paga,
//               Cancelado), cliente, email, telefones, valor_total, titulo…
//   Financeiro: lista de { dados: { pedido_id, parcela, status_pagamento
//               (Recebido, Aguardando pagamento, Vencido, DELETED, Estornado),
//               cliente, cliente_email, produto, … } }
// A própria TMB avisa que campos novos podem aparecer, então a leitura é
// tolerante e o payload bruto fica guardado.
export function lerPedidos(body: unknown): PedidoTmb[] {
  const itens = Array.isArray(body) ? body : [body];
  const out: PedidoTmb[] = [];
  for (const item of itens) {
    if (!item || typeof item !== "object") continue;
    const raiz = item as Record<string, unknown>;
    const d = (
      raiz.dados && typeof raiz.dados === "object"
        ? raiz.dados
        : raiz.data && typeof raiz.data === "object" && !Array.isArray(raiz.data)
          ? raiz.data
          : raiz
    ) as Record<string, unknown>;
    const cliente = (d.cliente && typeof d.cliente === "object" ? d.cliente : null) as Record<string, unknown> | null;
    const pedidoObj = (d.pedido && typeof d.pedido === "object" ? d.pedido : null) as Record<string, unknown> | null;

    const statusPedido = texto(d.status_pedido);
    const statusPagamento = texto(d.status_pagamento);
    const evento =
      texto(raiz.event ?? raiz.evento ?? raiz.tipo) ??
      (statusPagamento ? "financeiro" : statusPedido ? "vendas" : null);

    const parcela = numero(primeiro(d.parcela, d.numero_parcela, d.parcela_paga));
    const status = statusPedido ?? statusPagamento ?? texto(d.status) ?? texto(d.status_financeiro);

    out.push({
      pedidoId: texto(primeiro(d.pedido_id, pedidoObj?.id, pedidoObj ? null : d.pedido, d.id_pedido, d.order_id)),
      evento,
      email: (texto(primeiro(d.email, d.cliente_email, cliente?.email, d.customer_email)) ?? "").toLowerCase() || null,
      nome: texto(primeiro(cliente ? cliente.nome ?? cliente.name : d.cliente, d.cliente_nome, d.nome)),
      telefone: telefoneDe(primeiro(d.telefone_ativo, d.telefone, d.telefones, cliente?.telefone, d.celular)),
      produto: texto(primeiro(d.produto, d.produto_nome, d.lancamento)),
      oferta: texto(primeiro(d.titulo, d.oferta, d.code)),
      status,
      valor: numero(primeiro(d.valor_total, d.valor_entrada, d.valor_parcela_sem_juros, d.valor)),
      parcela: parcela ?? (statusPedido && /efetivad/i.test(semAcento(statusPedido)) ? 1 : null),
      dataPedido: texto(primeiro(d.data_efetivado, d.criado_em, d.data_pedido)),
      produtoId: texto(primeiro(d.produto_id, d.id_produto)),
      bruto: item,
    });
  }
  return out;
}

export function classificar(p: Pick<PedidoTmb, "status" | "evento">): Tipo {
  const s = semAcento(`${p.status ?? ""} ${p.evento ?? ""}`).toLowerCase();
  if (/estorn|reembols|refund|chargeback|devolv/.test(s)) return "reembolsado";
  if (/cancel|deleted/.test(s)) return "cancelado";
  if (/aguard|pendente|gerad|vencid|token|prova de vida|assinatura|selecao/.test(s)) return "aguardando";
  if (/efetivad|recebid|\bpag[oa]\b|\bpaid\b|aprovad|confirmad|quitad|liquidad/.test(s)) return "pago";
  return "outro";
}

// null = o aviso não diz o produto (a TMB configura o webhook por produto,
// então quem só cadastrou a URL no produto da Black recebe só a Black).
export function ehDaBlack(p: Pick<PedidoTmb, "produto" | "oferta" | "produtoId">, cfg: TmbConfig): boolean | null {
  if (p.produtoId && cfg.tmb_produto_id) return p.produtoId === cfg.tmb_produto_id;
  const alvo = [p.produto, p.oferta].filter(Boolean).join(" ");
  if (!alvo) return null;
  try {
    return new RegExp(cfg.filtro_black || "black", "i").test(semAcento(alvo));
  } catch {
    return /black/i.test(alvo);
  }
}

// ---------- registro ----------

export async function registrarEvento(
  supabase: SupabaseClient,
  p: PedidoTmb,
  origem: "webhook" | "varredura" | "simulacao"
): Promise<number | null> {
  const { data } = await supabase
    .from("tmb_eventos")
    .insert({
      pedido_id: p.pedidoId,
      evento: p.evento,
      email: p.email,
      nome: p.nome,
      telefone: p.telefone,
      produto: p.produto,
      oferta: p.oferta,
      status: p.status,
      valor: p.valor,
      parcela_paga: p.parcela,
      payload: p.bruto ?? {},
      origem,
    })
    .select("id")
    .maybeSingle();
  return (data?.id as number | undefined) ?? null;
}

async function anotarEvento(supabase: SupabaseClient, id: number | null, resultado: string): Promise<void> {
  if (id) await supabase.from("tmb_eventos").update({ resultado: resultado.slice(0, 500) }).eq("id", id);
}

// ---------- avisos (WhatsApp do Canal, pelo Unnichat) ----------

function quando(iso: string | null | undefined): string {
  if (!iso) return "?";
  return new Date(iso).toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// Manda o aviso pra cada telefone configurado: texto livre (funciona com a
// janela de 24h aberta) e, se não sair, o template de utilidade configurado.
// O WhatsApp oficial (Meta) não posta em grupo, por isso o destino é uma lista
// de números. Todo aviso fica registrado em webhook_log (source 'tmb').
export async function avisar(supabase: SupabaseClient, cfg: TmbConfig, msg: string): Promise<void> {
  const envios: { telefone: string; via: string; ok: boolean; erro?: string }[] = [];
  for (const tel of cfg.aviso_telefones ?? []) {
    const phone = tel.replace(/[^\d]/g, "");
    if (!phone) continue;
    try {
      const r = await unnichat(supabase, "POST", "/meta/messages", { phone, messageText: msg });
      if (r.status >= 200 && r.status < 300) {
        envios.push({ telefone: phone, via: "texto", ok: true });
        continue;
      }
      if (cfg.aviso_template_id) {
        // Parâmetro de template não aceita quebra de linha.
        const linha = msg.replace(/\s*\n+\s*/g, " · ").slice(0, 1000);
        const t = await unnichat(supabase, "POST", "/meta/templates", {
          phone,
          templateId: cfg.aviso_template_id,
          bodyParameters: [{ type: "text", text: linha }],
        });
        envios.push({ telefone: phone, via: "template", ok: t.status >= 200 && t.status < 300, erro: t.status >= 300 ? String(t.status) : undefined });
      } else {
        envios.push({ telefone: phone, via: "texto", ok: false, erro: `${r.status} ${JSON.stringify(r.body).slice(0, 200)}` });
      }
    } catch (e) {
      envios.push({ telefone: phone, via: "texto", ok: false, erro: e instanceof Error ? e.message.slice(0, 200) : "erro" });
    }
  }
  await supabase.from("webhook_log").insert({ source: "tmb_painel", note: "aviso", body: { texto: msg, envios } });
}

// ---------- checagens ----------

function escLike(s: string): string {
  return s.replace(/[\\%_]/g, (c) => `\\${c}`);
}

type Posse = { tem: boolean; detalhe: string; bloqueado: string | null };

// O e-mail já tem o pacote da Black? (matrícula na Nutror ou compra na Eduzz)
export async function checarPacote(supabase: SupabaseClient, cfg: TmbConfig, email: string): Promise<Posse> {
  const [mat, bloq, venda] = await Promise.all([
    supabase.rpc("tmb_matricula_pacote", { p_email: email, p_hash: cfg.pacote_nutror_hash }),
    supabase.rpc("tmb_nutror_bloqueio", { p_email: email }),
    supabase
      .from("sales")
      .select("created_at, status")
      .ilike("buyer_email", escLike(email))
      .ilike("product", "Black Friday Hist%rica 2026%")
      .eq("status", "paga")
      .order("created_at", { ascending: true })
      .limit(1),
  ]);
  const b = (bloq.data as { evento: string; em: string }[] | null)?.[0] ?? null;
  const bloqueado = b ? `${b.evento} em ${quando(b.em)}` : null;
  if (mat.data) {
    return { tem: true, detalhe: `Já tem o pacote na Nutror (matrícula em ${quando(mat.data as string)})`, bloqueado };
  }
  const v = venda.data?.[0];
  if (v) {
    return { tem: true, detalhe: `Comprou a Black na Eduzz (${quando(v.created_at as string)})`, bloqueado };
  }
  return { tem: false, detalhe: "Sem matrícula no pacote da Black", bloqueado };
}

// ---------- estado do pedido ----------

type Linha = {
  pedido_id: string;
  email: string;
  nome: string | null;
  status: string;
  detalhe: string | null;
  cancelado_em: string | null;
  teste: boolean;
};

const FINAIS = ["entregue", "ja_tinha"];

async function garantirLinha(supabase: SupabaseClient, p: PedidoTmb, teste: boolean): Promise<Linha | null> {
  if (!p.pedidoId || !p.email) return null;
  await supabase.from("tmb_entregas").upsert(
    {
      pedido_id: p.pedidoId,
      email: p.email,
      nome: p.nome,
      telefone: p.telefone,
      produto: [p.produto, p.oferta].filter(Boolean).join(" · ") || null,
      valor: p.valor,
      status: "aguardando",
      teste,
    },
    { onConflict: "pedido_id", ignoreDuplicates: true }
  );
  // Atualiza o que o aviso trouxe de novo, sem mexer no estado da entrega.
  const extra: Record<string, unknown> = { pedido_status: p.status, atualizado_em: new Date().toISOString() };
  if (p.nome) extra.nome = p.nome;
  if (p.telefone) extra.telefone = p.telefone;
  if (p.valor !== null) extra.valor = p.valor;
  if (p.parcela !== null) extra.parcela_paga = p.parcela;
  const { data } = await supabase
    .from("tmb_entregas")
    .update(extra)
    .eq("pedido_id", p.pedidoId)
    .select("pedido_id, email, nome, status, detalhe, cancelado_em, teste")
    .maybeSingle();
  return (data as Linha | null) ?? null;
}

// Muda o estado só se ele ainda não for um dos `exceto` (corrida segura: quem
// muda primeiro ganha, e só quem mudou manda aviso).
async function mudar(
  supabase: SupabaseClient,
  pedidoId: string,
  campos: Record<string, unknown>,
  exceto: string[]
): Promise<{ mudou: boolean; erro?: string; codigo?: string }> {
  let q = supabase
    .from("tmb_entregas")
    .update({ ...campos, atualizado_em: new Date().toISOString() })
    .eq("pedido_id", pedidoId);
  if (exceto.length) q = q.not("status", "in", `(${exceto.join(",")})`);
  const { data, error } = await q.select("pedido_id");
  if (error) return { mudou: false, erro: error.message, codigo: error.code };
  return { mudou: (data ?? []).length > 0 };
}

function quem(l: { nome: string | null; email: string }): string {
  return l.nome ? `${l.nome} (${l.email})` : l.email;
}

// ---------- regra de entrega ----------

export async function entregar(
  supabase: SupabaseClient,
  cfg: TmbConfig,
  p: PedidoTmb,
  opts: { origem: Origem; forcar?: boolean; simulacao?: boolean }
): Promise<Resultado> {
  const teste = Boolean(opts.simulacao);
  const linha = await garantirLinha(supabase, p, teste);
  if (!linha) return { pedidoId: p.pedidoId, status: "erro", detalhe: "Aviso sem número do pedido ou sem e-mail" };
  const pid = linha.pedido_id;
  const prefixo = teste ? "🧪 SIMULAÇÃO — " : "";

  if (FINAIS.includes(linha.status)) {
    return { pedidoId: pid, status: linha.status, detalhe: `Nada a fazer: ${linha.detalhe ?? linha.status}` };
  }
  if (linha.cancelado_em && !opts.forcar) {
    const detalhe = `Pedido cancelado/reembolsado em ${quando(linha.cancelado_em)}; não pedi entrega (use "Entregar agora" se for o caso)`;
    await mudar(supabase, pid, { detalhe }, FINAIS);
    return { pedidoId: pid, status: linha.status, detalhe };
  }

  // 1) Já tem o pacote?
  const posse = await checarPacote(supabase, cfg, linha.email);
  if (posse.bloqueado) {
    const detalhe = `Acesso marcado como bloqueado/inativo na Nutror (${posse.bloqueado}). Não mexi.`;
    const r = await mudar(supabase, pid, { status: "ja_tinha", bloqueado: true, detalhe }, FINAIS);
    if (r.mudou) await avisar(supabase, cfg, `${prefixo}🔒 TMB Black: ${quem(linha)} pagou, mas o acesso está bloqueado/inativo na Nutror. Não mexi — decisão humana. Pedido ${pid}.`);
    return { pedidoId: pid, status: "ja_tinha", detalhe };
  }
  if (posse.tem) {
    const agora = new Date().toISOString();
    // Estava esperando a entrega (pedida ao time ou simulada) e a matrícula
    // apareceu: foi entregue. Senão, o e-mail já tinha o pacote antes.
    if (["pendente", "simulado", "erro"].includes(linha.status)) {
      const detalhe = `Matrícula no pacote confirmada (${posse.detalhe})`;
      const r = await mudar(supabase, pid, { status: "entregue", detalhe, confirmado_em: agora, entregue_em: agora }, FINAIS);
      if (r.mudou) await avisar(supabase, cfg, `${prefixo}✅ ENTREGUE — TMB Black: ${quem(linha)} (pedido ${pid}) já tem o pacote na Nutror.`);
      return { pedidoId: pid, status: "entregue", detalhe };
    }
    const r = await mudar(supabase, pid, { status: "ja_tinha", detalhe: posse.detalhe, confirmado_em: agora }, FINAIS);
    if (!r.mudou && r.erro) return { pedidoId: pid, status: "erro", detalhe: r.erro };
    return { pedidoId: pid, status: "ja_tinha", detalhe: posse.detalhe };
  }

  // 2) Mesmo e-mail já entregue ou com entrega pedida em outro pedido?
  const { data: outro } = await supabase
    .from("tmb_entregas")
    .select("pedido_id, status")
    .ilike("email", escLike(linha.email))
    .neq("pedido_id", pid)
    .eq("teste", teste)
    .in("status", ["entregue", "pendente"])
    .limit(1);
  if (outro?.length) {
    const detalhe = `Mesmo e-mail já está no pedido ${outro[0].pedido_id} (${outro[0].status}); não peço de novo`;
    await mudar(supabase, pid, { status: "ja_tinha", detalhe }, FINAIS);
    return { pedidoId: pid, status: "ja_tinha", detalhe };
  }

  // 3) Modo teste ou simulação: mostra o que faria.
  const oQueFazer = `Entrega Manual na Eduzz: produto ${cfg.eduzz_produto_id} (Black Friday Histórica 2026) → ⋯ → Entrega Manual → ${linha.email}`;
  if (cfg.modo_teste || teste) {
    const detalhe = `Modo teste: faria a ${oQueFazer}`;
    const r = await mudar(supabase, pid, { status: "simulado", detalhe }, opts.forcar ? FINAIS : [...FINAIS, "simulado"]);
    if (r.mudou) {
      await avisar(
        supabase,
        cfg,
        `${prefixo || "🧪 MODO TESTE — "}TMB Black: ${quem(linha)} pagou a entrada (pedido ${pid}) e não tem o pacote. Faria: ${oQueFazer}.`
      );
    }
    return { pedidoId: pid, status: "simulado", detalhe };
  }

  // 4) Pede a Entrega Manual ao time (a API da Eduzz não faz isso).
  const detalhe = `Aguardando a ${oQueFazer}. O painel confirma sozinho quando a matrícula chegar da Nutror.`;
  const r = await mudar(supabase, pid, { status: "pendente", detalhe, tentativas: 1 }, opts.forcar ? FINAIS : [...FINAIS, "pendente"]);
  if (r.codigo === "23505") {
    const d = "Outro pedido com o mesmo e-mail pediu a entrega ao mesmo tempo; não peço de novo";
    await mudar(supabase, pid, { status: "ja_tinha", detalhe: d }, FINAIS);
    return { pedidoId: pid, status: "ja_tinha", detalhe: d };
  }
  if (r.erro) {
    await mudar(supabase, pid, { status: "erro", detalhe: r.erro }, FINAIS);
    await avisar(supabase, cfg, `❗ TMB Black: erro ao registrar a entrega de ${quem(linha)} (pedido ${pid}): ${r.erro}`);
    return { pedidoId: pid, status: "erro", detalhe: r.erro };
  }
  if (r.mudou) {
    await avisar(
      supabase,
      cfg,
      `📦 ENTREGAR AGORA — TMB Black\n${quem(linha)} pagou a entrada (pedido ${pid}) e ainda não tem o pacote.\n${oQueFazer}.\nO painel confirma quando a matrícula chegar.`
    );
  }
  return { pedidoId: pid, status: "pendente", detalhe };
}

// Cancelamento ou reembolso: só registra e avisa. Nunca bloqueia acesso.
async function cancelar(
  supabase: SupabaseClient,
  cfg: TmbConfig,
  p: PedidoTmb,
  tipo: "cancelado" | "reembolsado",
  simulacao: boolean
): Promise<Resultado> {
  const linha = await garantirLinha(supabase, p, simulacao);
  if (!linha) return { pedidoId: p.pedidoId, status: "erro", detalhe: "Aviso sem número do pedido ou sem e-mail" };
  const primeiraVez = !linha.cancelado_em;
  if (primeiraVez) {
    await supabase
      .from("tmb_entregas")
      .update({ cancelado_em: new Date().toISOString(), atualizado_em: new Date().toISOString() })
      .eq("pedido_id", linha.pedido_id)
      .is("cancelado_em", null);
    const prefixo = simulacao ? "🧪 SIMULAÇÃO — " : "";
    const acesso =
      linha.status === "entregue" || linha.status === "ja_tinha"
        ? "Tem o pacote na Nutror."
        : linha.status === "pendente"
          ? "A Entrega Manual estava pendente: NÃO entregue."
          : "Não tinha recebido o pacote por aqui.";
    await avisar(
      supabase,
      cfg,
      `${prefixo}⚠️ TMB Black: pedido ${linha.pedido_id} de ${quem(linha)} ${tipo === "reembolsado" ? "foi ESTORNADO/REEMBOLSADO" : "foi CANCELADO"} (${p.status ?? tipo}). ${acesso} Não mexi no acesso — a decisão é humana.`
    );
  }
  return { pedidoId: linha.pedido_id, status: linha.status, detalhe: `${tipo} registrado${primeiraVez ? " e avisado" : " (já avisado antes)"}` };
}

// NaN quando não entende a data (aí ela conta como desconhecida).
function instante(dt: string): number {
  let s = dt.trim();
  // "05/11/2026 20:35" (formato brasileiro) → "2026-11-05 20:35"
  const br = /^(\d{2})\/(\d{2})\/(\d{4})(.*)$/.exec(s);
  if (br) s = `${br[3]}-${br[2]}-${br[1]}${br[4]}`;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) s += " 00:00:00";
  // A TMB manda data local sem fuso ("2026-11-05 20:35:36"); com fuso (Z, +00, -03:00), respeita.
  s = s.replace(" ", "T");
  const fuso = /([+-])(\d\d):?(\d\d)?$/.exec(s);
  if (fuso) s = `${s.slice(0, fuso.index)}${fuso[1]}${fuso[2]}:${fuso[3] ?? "00"}`;
  else if (!/[zZ]$/.test(s)) s += "-03:00";
  return new Date(s).getTime();
}

// O produto da Black na TMB é o mesmo de 2025 e as parcelas da Black antiga
// continuam chegando: só vale pedido criado/efetivado a partir de black_desde.
async function daBlackAtual(supabase: SupabaseClient, cfg: TmbConfig, p: PedidoTmb): Promise<{ ok: boolean; motivo?: string }> {
  if (p.pedidoId) {
    const { data: ja } = await supabase.from("tmb_entregas").select("pedido_id").eq("pedido_id", p.pedidoId).maybeSingle();
    if (ja) return { ok: true };
  }
  let dt = p.dataPedido;
  if (!dt && p.pedidoId && /^\d+$/.test(p.pedidoId)) {
    const { data: raw } = await supabase
      .from("tmb_pedidos_raw")
      .select("data_efetivado, criado_em")
      .eq("pedido_id", Number(p.pedidoId))
      .maybeSingle();
    dt = (raw?.data_efetivado as string | null) ?? (raw?.criado_em as string | null) ?? null;
  }
  const desde = instante(`${cfg.black_desde} 00:00:00`);
  const t = dt ? instante(dt) : NaN;
  if (dt && Number.isFinite(t)) {
    if (t < desde) return { ok: false, motivo: `Pedido de ${dt.slice(0, 10)}, antes da Black 2026 (${cfg.black_desde})` };
    return { ok: true };
  }
  // Sem data: o aviso "Vendas" chega na hora em que o pedido muda de status,
  // e a entrada é a 1ª parcela. Parcela maior sem data = provável Black antiga.
  if (p.evento === "vendas") return { ok: true };
  if (p.parcela !== null && p.parcela <= 1) return { ok: true };
  return { ok: false, motivo: `Parcela ${p.parcela ?? "?"} de pedido sem data conhecida (provável Black antiga); a varredura confere` };
}

// Ponto de entrada de cada pedido lido (webhook, varredura ou simulação).
export async function processarPedido(
  supabase: SupabaseClient,
  cfg: TmbConfig,
  p: PedidoTmb,
  opts: { origem: Origem; eventoId?: number | null; simulacao?: boolean; forcar?: boolean }
): Promise<Resultado> {
  const simulacao = Boolean(opts.simulacao);
  let r: Resultado;
  const black = ehDaBlack(p, cfg);
  const atual = black === false || !p.pedidoId || !p.email || simulacao ? { ok: true } : await daBlackAtual(supabase, cfg, p);
  if (black === false) {
    r = { pedidoId: p.pedidoId, status: "ignorado", detalhe: "Não é pedido da Black" };
  } else if (!p.pedidoId || !p.email) {
    r = { pedidoId: p.pedidoId, status: "ignorado", detalhe: "Aviso sem número do pedido ou sem e-mail" };
  } else if (!atual.ok) {
    r = { pedidoId: p.pedidoId, status: "ignorado", detalhe: atual.motivo ?? "Fora da Black 2026" };
  } else {
    const tipo = classificar(p);
    if (tipo === "pago") {
      r = await entregar(supabase, cfg, p, { origem: opts.origem, simulacao, forcar: opts.forcar });
    } else if (tipo === "cancelado" || tipo === "reembolsado") {
      r = await cancelar(supabase, cfg, p, tipo, simulacao);
    } else {
      const linha = await garantirLinha(supabase, p, simulacao);
      r = {
        pedidoId: p.pedidoId,
        status: linha?.status ?? "aguardando",
        detalhe: `Status "${p.status ?? "?"}": ainda sem a 1ª parcela paga`,
      };
    }
    if (black === null) r.detalhe += " (o aviso não diz o produto; tratado como Black)";
  }
  await anotarEvento(supabase, opts.eventoId ?? null, `${r.status}: ${r.detalhe}`);
  return r;
}

// Erro inesperado no processamento: marca o pedido (se ainda não fechou) e avisa.
export async function registrarErro(supabase: SupabaseClient, cfg: TmbConfig | null, p: PedidoTmb, detalhe: string): Promise<void> {
  if (p.pedidoId) {
    await supabase
      .from("tmb_entregas")
      .update({ status: "erro", detalhe: detalhe.slice(0, 500), atualizado_em: new Date().toISOString() })
      .eq("pedido_id", p.pedidoId)
      .not("status", "in", "(entregue,ja_tinha)");
  }
  if (cfg) {
    await avisar(supabase, cfg, `❗ TMB Black: erro no pedido ${p.pedidoId ?? "?"} (${p.email ?? "sem e-mail"}): ${detalhe.slice(0, 300)}`);
  }
}

// ---------- confirmação pela Nutror ----------

// Chamado pelo webhook da Eduzz a cada nutror.enrollment_created: se a
// matrícula é no pacote da Black e o e-mail tem pedido TMB esperando, fecha
// como entregue e avisa.
export async function confirmarMatricula(supabase: SupabaseClient, body: unknown): Promise<void> {
  const d = (body as { data?: Record<string, unknown> } | null)?.data;
  const email = String((d?.learner as { email?: string } | undefined)?.email ?? "")
    .trim()
    .toLowerCase();
  if (!email) return;
  const cfg = await lerConfig(supabase);
  if (!cfg) return;
  const hashes = [
    (d?.content as { hash?: string } | undefined)?.hash,
    ...(((d?.courses as { hash?: string }[] | undefined) ?? []).map((c) => c.hash)),
  ];
  if (!hashes.includes(cfg.pacote_nutror_hash)) return;
  const agora = new Date().toISOString();
  const { data } = await supabase
    .from("tmb_entregas")
    .update({ status: "entregue", confirmado_em: agora, entregue_em: agora, detalhe: `Matrícula no pacote confirmada pela Nutror em ${quando(agora)}`, atualizado_em: agora })
    .ilike("email", escLike(email))
    .in("status", ["pendente", "simulado", "erro"])
    .select("pedido_id, email, nome, teste");
  for (const l of (data ?? []) as { pedido_id: string; email: string; nome: string | null; teste: boolean }[]) {
    await avisar(supabase, cfg, `${l.teste ? "🧪 SIMULAÇÃO — " : ""}✅ ENTREGUE — TMB Black: ${quem(l)} (pedido ${l.pedido_id}) já tem o pacote na Nutror.`);
  }
  // Marcado à mão como entregue: só registra a confirmação.
  await supabase
    .from("tmb_entregas")
    .update({ confirmado_em: agora })
    .ilike("email", escLike(email))
    .eq("status", "entregue")
    .is("confirmado_em", null);
}

// ---------- ações do painel ----------

export async function linhaComoPedido(supabase: SupabaseClient, pedidoId: string): Promise<PedidoTmb | null> {
  const { data } = await supabase
    .from("tmb_entregas")
    .select("pedido_id, email, nome, telefone, produto, valor, pedido_status, parcela_paga")
    .eq("pedido_id", pedidoId)
    .maybeSingle();
  if (!data) return null;
  return {
    pedidoId: data.pedido_id,
    evento: "painel",
    email: data.email,
    nome: data.nome,
    telefone: data.telefone,
    produto: data.produto,
    oferta: null,
    status: data.pedido_status,
    valor: data.valor,
    parcela: data.parcela_paga,
    dataPedido: null,
    produtoId: null,
    bruto: null,
  };
}

export async function marcarEntregue(supabase: SupabaseClient, cfg: TmbConfig, pedidoId: string, por: string): Promise<Resultado> {
  const agora = new Date().toISOString();
  const { data } = await supabase
    .from("tmb_entregas")
    .update({ status: "entregue", entregue_em: agora, detalhe: `Marcado como entregue por ${por} em ${quando(agora)} (aguardando a matrícula confirmar)`, atualizado_em: agora })
    .eq("pedido_id", pedidoId)
    .not("status", "in", "(entregue,ja_tinha)")
    .select("pedido_id, email, nome, teste")
    .maybeSingle();
  if (!data) return { pedidoId, status: "sem_mudanca", detalhe: "Pedido já estava entregue ou não existe" };
  // Se a matrícula já tinha chegado antes do clique, confirma na hora.
  const posse = await checarPacote(supabase, cfg, data.email);
  if (posse.tem) await supabase.from("tmb_entregas").update({ confirmado_em: agora }).eq("pedido_id", pedidoId);
  await avisar(supabase, cfg, `${data.teste ? "🧪 SIMULAÇÃO — " : ""}✅ ENTREGUE (marcado por ${por}) — TMB Black: ${quem(data)} (pedido ${pedidoId}).`);
  return { pedidoId, status: "entregue", detalhe: "Marcado como entregue" };
}

// ---------- varredura diária ----------

// Pedidos da Black na TMB pela API, sem credencial nova: a função
// sync_tmb_pedidos do Supabase (cron diário às 4h45 UTC) já consulta
// GET api.tmbeducacao.com.br/api/pedidos com o token guardado no Vault
// (tmb_access_token) e grava em tmb_pedidos_raw. A varredura só pede uma
// atualização dos últimos 15 dias e lê a tabela.
async function pedidosDaTmb(supabase: SupabaseClient, cfg: TmbConfig): Promise<{ pedidos: PedidoTmb[]; erro?: string; atualizados?: number }> {
  const hoje = new Date();
  const inicio = new Date(hoje.getTime() - 15 * 86400_000);
  const dia = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(d);
  const sync = await supabase.rpc("sync_tmb_pedidos", { p_start: dia(inicio), p_end: dia(hoje) });
  let q = supabase
    .from("tmb_pedidos_raw")
    .select("pedido_id, status_pedido, status_financeiro, produto_id, lancamento, cliente, email, valor_total, criado_em, data_efetivado")
    .gte("criado_em", `${cfg.black_desde}T03:00:00Z`)
    .limit(2000);
  q = cfg.tmb_produto_id ? q.eq("produto_id", Number(cfg.tmb_produto_id)) : q.ilike("lancamento", "%black%");
  const { data, error } = await q;
  if (error) return { pedidos: [], erro: `Leitura de tmb_pedidos_raw: ${error.message}` };
  const pedidos = ((data ?? []) as Record<string, unknown>[]).map((r) => {
    const status = texto(r.status_pedido);
    return {
      pedidoId: texto(r.pedido_id),
      evento: "varredura",
      email: (texto(r.email) ?? "").toLowerCase() || null,
      nome: texto(r.cliente),
      telefone: null,
      produto: texto(r.lancamento),
      oferta: null,
      status,
      valor: numero(r.valor_total),
      parcela: status && /efetivad/i.test(semAcento(status)) ? 1 : null,
      dataPedido: texto(r.data_efetivado) ?? texto(r.criado_em),
      produtoId: texto(r.produto_id),
      bruto: r,
    } satisfies PedidoTmb;
  });
  return {
    pedidos,
    erro: sync.error ? `Atualização pela API da TMB falhou (${sync.error.message}); usei os dados da última sincronização` : undefined,
    atualizados: typeof sync.data === "number" ? sync.data : undefined,
  };
}

export async function varredura(supabase: SupabaseClient, cfg: TmbConfig): Promise<{ resumo: string }> {
  const cont: Record<string, number> = {};
  const somar = (k: string) => (cont[k] = (cont[k] ?? 0) + 1);

  // 1) Pedidos da Black na TMB (pega aviso que não chegou).
  const api = await pedidosDaTmb(supabase, cfg);
  for (const p of api.pedidos) {
    if (!p.pedidoId || !p.email) continue;
    const tipo = classificar(p);
    // Só registra evento quando o status mudou desde o último registro.
    const { data: ult } = await supabase
      .from("tmb_eventos")
      .select("status")
      .eq("pedido_id", p.pedidoId)
      .order("recebido_em", { ascending: false })
      .limit(1);
    const novo = ult?.[0]?.status !== p.status;
    const eventoId = novo ? await registrarEvento(supabase, p, "varredura") : null;
    if (tipo === "pago" || tipo === "cancelado" || tipo === "reembolsado") {
      const r = await processarPedido(supabase, cfg, p, { origem: "varredura", eventoId });
      somar(`api_${r.status}`);
    }
  }

  // 2) Pedidos já conhecidos que ainda não fecharam: confere a matrícula de novo.
  const { data: abertos } = await supabase
    .from("tmb_entregas")
    .select("pedido_id, email, nome, status, entregue_em, confirmado_em, teste")
    .eq("teste", false)
    .in("status", ["pendente", "simulado", "erro", "entregue"]);
  const semMatricula: string[] = [];
  for (const l of (abertos ?? []) as { pedido_id: string; email: string; nome: string | null; status: string; confirmado_em: string | null }[]) {
    if (l.status === "entregue" && l.confirmado_em) continue;
    const posse = await checarPacote(supabase, cfg, l.email);
    if (posse.tem) {
      const agora = new Date().toISOString();
      if (l.status === "entregue") {
        await supabase.from("tmb_entregas").update({ confirmado_em: agora }).eq("pedido_id", l.pedido_id);
      } else {
        await supabase
          .from("tmb_entregas")
          .update({ status: "entregue", confirmado_em: agora, entregue_em: agora, detalhe: `Matrícula confirmada na varredura (${posse.detalhe})`, atualizado_em: agora })
          .eq("pedido_id", l.pedido_id)
          .in("status", ["pendente", "simulado", "erro"]);
      }
      somar("confirmados");
    } else if (l.status === "pendente" || l.status === "entregue") {
      semMatricula.push(quem(l));
      somar("sem_matricula");
    } else if (l.status === "simulado" && !cfg.modo_teste) {
      // Modo teste foi desligado: o que estava só simulado vira pedido de entrega.
      const p = await linhaComoPedido(supabase, l.pedido_id);
      if (p) somar(`ex_simulado_${(await entregar(supabase, cfg, p, { origem: "varredura" })).status}`);
    } else {
      somar(l.status);
    }
  }

  const partes = [
    `TMB: ${api.pedidos.length} pedidos da Black 2026`,
    ...(api.erro ? [api.erro] : []),
    ...Object.entries(cont).map(([k, v]) => `${k}: ${v}`),
  ];
  const resumo = partes.join(" · ");
  await supabase
    .from("tmb_config")
    .update({ ultima_varredura: new Date().toISOString(), ultima_varredura_resumo: resumo.slice(0, 1000) })
    .eq("id", 1);
  if (semMatricula.length) {
    await avisar(
      supabase,
      cfg,
      `⏰ Varredura TMB Black: ${semMatricula.length} pedido(s) pago(s) ainda sem o pacote na Nutror: ${semMatricula.slice(0, 15).join("; ")}${semMatricula.length > 15 ? "…" : ""}. Faça a Entrega Manual do produto ${cfg.eduzz_produto_id} na Eduzz.`
    );
  }
  if (api.erro) {
    await avisar(supabase, cfg, `❗ Varredura TMB: ${api.erro}`);
  }
  return { resumo };
}
