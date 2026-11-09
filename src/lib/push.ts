import webpush from "web-push";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { brl } from "@/lib/format";

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
}

type Assinatura = { id: string; endpoint: string; p256dh: string; auth: string };

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

/** Manda pra todos os aparelhos que ativaram o aviso. */
export async function pushParaTodos(payload: PushPayload): Promise<number> {
  const admin = getSupabaseAdmin();
  if (!admin) return 0;
  const { data } = await admin.from("push_assinaturas").select("id,endpoint,p256dh,auth");
  return enviar((data ?? []) as Assinatura[], payload);
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
  valor: number;
  produto: string;
  vendedor?: string | null;
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
    title: `💰 Venda nova · ${brl(v.valor)}`,
    body: [v.produto, v.plataforma, v.vendedor ? `Vendedor: ${v.vendedor}` : null].filter(Boolean).join(" · "),
    url: "/vendas",
    tag: v.chave,
  });
}
