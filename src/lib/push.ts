import webpush from "web-push";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

// Web push do painel: avisa no celular/computador de quem ativou o sino no
// menu (tabela push_assinaturas). As chaves VAPID vêm das envs
// VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY se existirem; senão o servidor gera um
// par no primeiro uso e guarda em push_config (só o service role lê).

type Chaves = { publicKey: string; privateKey: string };
let chavesCache: Chaves | null = null;

async function chaves(): Promise<Chaves | null> {
  if (chavesCache) return chavesCache;
  if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
    chavesCache = { publicKey: process.env.VAPID_PUBLIC_KEY, privateKey: process.env.VAPID_PRIVATE_KEY };
    return chavesCache;
  }
  const admin = getSupabaseAdmin();
  if (!admin) return null;
  const ler = async () => {
    const { data } = await admin.from("push_config").select("public_key,private_key").eq("id", 1).maybeSingle();
    return data ? { publicKey: data.public_key as string, privateKey: data.private_key as string } : null;
  };
  let c = await ler();
  if (!c) {
    const novo = webpush.generateVAPIDKeys();
    // Duas chamadas ao mesmo tempo: só a primeira grava; as duas releem.
    await admin
      .from("push_config")
      .upsert({ id: 1, public_key: novo.publicKey, private_key: novo.privateKey }, { onConflict: "id", ignoreDuplicates: true });
    c = await ler();
  }
  chavesCache = c;
  return c;
}

export async function pushPublicKey(): Promise<string | null> {
  return (await chaves())?.publicKey ?? null;
}

async function configurar(): Promise<boolean> {
  const c = await chaves();
  if (!c) return false;
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || "mailto:suporte@canaldoanfitriao.com.br", c.publicKey, c.privateKey);
  return true;
}

export interface PushPayload {
  title: string;
  body: string;
  url?: string;
  tag?: string;
  /** Ícone próprio (ex.: call em azul, pra não confundir com venda). */
  icon?: string;
  badge?: string;
}

type Assinatura = { id: string; endpoint: string; p256dh: string; auth: string };

/**
 * "vendas": o app do painel (ícone rosa). "calls": o app Agenda (ícone azul,
 * /calls/agenda), que só recebe call agendada. No iPhone o ícone do aviso é o
 * do app que assinou, por isso são dois apps.
 */
export type CanalPush = "vendas" | "calls";

async function enviar(assinaturas: Assinatura[], payload: PushPayload): Promise<number> {
  const admin = getSupabaseAdmin();
  if (!admin || assinaturas.length === 0 || !(await configurar())) return 0;
  const corpo = JSON.stringify(payload);
  let ok = 0;
  await Promise.all(
    assinaturas.map(async (a) => {
      try {
        await webpush.sendNotification(
          { endpoint: a.endpoint, keys: { p256dh: a.p256dh, auth: a.auth } },
          corpo,
          { TTL: 24 * 3600, urgency: "high" }
        );
        ok++;
        await admin.from("push_assinaturas").update({ ultimo_envio_em: new Date().toISOString() }).eq("id", a.id);
      } catch (e) {
        // 404/410: o aparelho desativou ou o navegador jogou a assinatura fora.
        const status = (e as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) {
          await admin.from("push_assinaturas").delete().eq("id", a.id);
        } else {
          await admin.from("webhook_log").insert({
            source: "push",
            note: `ERRO: push falhou (${status ?? "?"})`,
            body: { erro: e instanceof Error ? e.message.slice(0, 300) : String(e) },
          });
        }
      }
    })
  );
  return ok;
}

/** Manda pra todos os aparelhos que ativaram o aviso no app do painel. */
export async function pushParaTodos(payload: PushPayload): Promise<number> {
  const admin = getSupabaseAdmin();
  if (!admin) return 0;
  const { data } = await admin.from("push_assinaturas").select("id,endpoint,p256dh,auth").eq("canal", "vendas");
  return enviar((data ?? []) as Assinatura[], payload);
}

/**
 * Aviso de call: vai pro app Agenda (ícone azul). Quem ainda não instalou o
 * Agenda recebe no app do painel, como antes.
 */
async function pushDeCall(payload: PushPayload): Promise<number> {
  const admin = getSupabaseAdmin();
  if (!admin) return 0;
  const { data } = await admin.from("push_assinaturas").select("id,endpoint,p256dh,auth,email,canal");
  const todas = (data ?? []) as (Assinatura & { email: string | null; canal: CanalPush })[];
  const comAgenda = new Set(todas.filter((a) => a.canal === "calls").map((a) => a.email ?? ""));
  return enviar(
    todas.filter((a) => a.canal === "calls" || !comAgenda.has(a.email ?? "")),
    payload
  );
}

/** Manda só pra um aparelho (o teste logo depois de ativar). */
export async function pushParaEndpoint(endpoint: string, payload: PushPayload): Promise<number> {
  const admin = getSupabaseAdmin();
  if (!admin) return 0;
  const { data } = await admin.from("push_assinaturas").select("id,endpoint,p256dh,auth").eq("endpoint", endpoint);
  return enviar((data ?? []) as Assinatura[], payload);
}

export interface VendaNova {
  /** 'eduzz:<fatura>' ou 'tmb:<pedido>': a mesma venda nunca avisa duas vezes. */
  chave: string;
  plataforma: "Eduzz" | "TMB";
  /** Preço do produto (com cupom), sem os juros do parcelamento. */
  valor: number;
  produto: string;
  vendedor?: string | null;
  /** Em quantas vezes (Eduzz manda em installments); 1 ou vazio = à vista. */
  parcelas?: number | null;
  /** creditCard, pix, bankslip... (paymentMethod da Eduzz). */
  metodo?: string | null;
  /** Cobrança anual de assinatura que já existia (não é venda nova). */
  renovacao?: boolean;
  /** Order bumps da mesma fatura (o produto acima é o principal). */
  bumps?: { nome: string; valor: number | null }[];
}

// R$ 197 / R$ 49,75 — centavo só quando tem (o brl() do painel arredonda).
function reais(v: number): string {
  const inteiro = Math.abs(v - Math.round(v)) < 0.005;
  return v.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: inteiro ? 0 : 2,
    maximumFractionDigits: inteiro ? 0 : 2,
  });
}

// "Seu imóvel no piloto automático - Variação 1" → "Seu imóvel no piloto automático"
function semVariacao(nome: string): string {
  return nome.replace(/\s*-\s*Varia[çc][ãa]o\s*\d+\s*$/i, "").trim();
}

// "Airbnb do Zero (R$ 197) + order bump: Seu imóvel no piloto automático (R$ 49,75)"
function descreverProdutos(v: VendaNova): string {
  const bumps = (v.bumps ?? []).filter((b) => b.nome);
  if (bumps.length === 0) return semVariacao(v.produto);
  const totalBumps = bumps.reduce((a, b) => a + (b.valor ?? 0), 0);
  const principalValor = v.valor - totalBumps;
  const comValor = (nome: string, valor: number | null) =>
    valor != null && valor > 0 ? `${semVariacao(nome)} (${reais(valor)})` : semVariacao(nome);
  return `${comValor(v.produto, principalValor > 0 ? principalValor : null)} + order bump: ${bumps
    .map((b) => comValor(b.nome, b.valor))
    .join(", ")}`;
}

function nomeDoMetodo(m: string | null | undefined): string | null {
  const t = (m ?? "").toLowerCase();
  if (!t) return null;
  if (t.includes("pix")) return "Pix";
  if (t.includes("card") || t.includes("cartao") || t.includes("credit")) return "cartão";
  if (t.includes("bank") || t.includes("billet") || t.includes("boleto")) return "boleto";
  return null;
}

/** Avisa venda nova, uma vez só por venda. */
export async function notificarVenda(v: VendaNova): Promise<void> {
  const admin = getSupabaseAdmin();
  if (!admin) return;
  const { data: nova } = await admin
    .from("vendas_notificadas")
    .upsert({ chave: v.chave }, { onConflict: "chave", ignoreDuplicates: true })
    .select("chave");
  if (!nova || nova.length === 0) return;
  await pushParaTodos({
    // Fernando, 16/11: o preço do produto, não o total com juros (os juros do
    // parcelamento não vêm pra empresa), e em quantas vezes foi.
    title: `${v.renovacao ? "🔁 Renovação" : "💰 Venda nova"} · ${reais(v.valor)}${v.parcelas && v.parcelas > 1 ? ` em ${v.parcelas}x` : ""}`,
    body: [descreverProdutos(v), v.plataforma, nomeDoMetodo(v.metodo), v.vendedor ? `Vendedor: ${v.vendedor}` : null]
      .filter(Boolean)
      .join(" · "),
    url: "/vendas",
    tag: v.chave,
  });
}

export interface CallNova {
  id: string;
  nome: string | null;
  /** ISO do início da call. */
  inicio: string;
  vendedor: string | null;
  /** Substituiu uma call que o lead já tinha. */
  remarcada?: boolean;
}

/**
 * Avisa call agendada pelo Téo, uma vez só por call (Fernando, 18/11: "eu
 * gosto de saber quando tem call agendada", com ícone diferente da venda).
 * Vai pro app Agenda (ícone azul); sem ele, pro app do painel.
 */
export async function notificarCall(c: CallNova): Promise<void> {
  const admin = getSupabaseAdmin();
  if (!admin) return;
  const chave = `call:${c.id}`;
  const { data: nova } = await admin
    .from("vendas_notificadas")
    .upsert({ chave }, { onConflict: "chave", ignoreDuplicates: true })
    .select("chave");
  if (!nova || nova.length === 0) return;
  // Dia e hora no começo do título: o iPhone corta o fim do título numa linha
  // só (Fernando, 18/11: "tá cortando a data e horário, pra mim isso é
  // importante"). O resto vai no corpo, que quebra linha.
  const p = (o: Intl.DateTimeFormatOptions) =>
    new Date(c.inicio).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", ...o });
  const semana = p({ weekday: "short" }).replace(".", "");
  const dia = `${semana.charAt(0).toUpperCase()}${semana.slice(1)} ${p({ day: "2-digit", month: "2-digit" })}`;
  const hora = p({ hour: "2-digit", minute: "2-digit" }).replace(":00", "h").replace(":", "h");
  const primeiro = (s: string | null) => (s ?? "").trim().split(/\s+/)[0] || null;
  const quem = [primeiro(c.nome) ?? "Lead", c.vendedor ? `com ${primeiro(c.vendedor)}` : null].filter(Boolean).join(" ");
  await pushDeCall({
    title: `📞 ${dia} às ${hora}${c.remarcada ? " · remarcada" : ""}`,
    body: `${c.remarcada ? "Call remarcada" : "Call agendada"}: ${quem} · marcada pelo Téo`,
    url: "/calls/agenda",
    tag: chave,
    icon: "/icon-call-192.png",
    badge: "/icon-call-badge.png",
  });
}
