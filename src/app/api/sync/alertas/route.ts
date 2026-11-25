import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { pushParaTodos } from "@/lib/push";

// Alerta de importação parada (Fernando, 25/11): o token da Meta venceu em
// setembro, o gasto ficou sem importar o mês de outubro inteiro e ninguém
// soube — a provisão errou a fatura em R$ 47 mil. De hora em hora, olha
// alertas_integracoes() (migração 0150: mais de 9 h sem leitura boa do gasto
// da Meta, das faturas ou do custo do WhatsApp) e avisa no celular de quem
// ativou o sino do painel. Repete a cada 12 h enquanto continuar parado e
// avisa quando voltar.
// GET: cron da Vercel (vercel.json). A autorização fica no proxy (src/proxy.ts)
// para todo /api/sync.

export const maxDuration = 60;

interface Alerta {
  chave: string;
  titulo: string;
  ok_em: string | null;
  horas: number;
  erro: string | null;
  token: boolean;
}

const REPETE_MS = 12 * 3600_000;

function corpo(a: Alerta): string {
  const desde = a.ok_em ? `Sem leitura boa há ${a.horas} h.` : "Sem leitura boa nos últimos 30 dias.";
  if (a.token) return `${desde} O token de acesso da Meta expirou: gere um novo e troque no Vault.`;
  return `${desde}${a.erro ? ` Último erro: ${a.erro.slice(0, 120)}` : ""}`;
}

async function rodar() {
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "Supabase não configurado." }, { status: 501 });

  const { data, error } = await supabase.rpc("alertas_integracoes");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const alertas = (data ?? []) as Alerta[];

  const { data: enviados } = await supabase.from("integracao_alertas").select("chave, enviado_em");
  const ultimo = new Map((enviados ?? []).map((e) => [e.chave as string, Date.parse(e.enviado_em as string)]));

  const avisados: string[] = [];
  for (const a of alertas) {
    const antes = ultimo.get(a.chave);
    if (antes && Date.now() - antes < REPETE_MS) continue;
    await pushParaTodos({
      title: `⚠️ ${a.titulo}`,
      body: corpo(a),
      url: a.chave === "whatsapp_custos" ? "/custos/whatsapp" : "/custos/trafego",
      tag: `alerta-${a.chave}`,
    });
    await supabase
      .from("integracao_alertas")
      .upsert({ chave: a.chave, enviado_em: new Date().toISOString(), detalhe: corpo(a) }, { onConflict: "chave" });
    avisados.push(a.chave);
  }

  // Voltou: avisa uma vez e limpa, pra próxima queda avisar na hora.
  const abertas = new Set(alertas.map((a) => a.chave));
  const voltaram = [...ultimo.keys()].filter((k) => !abertas.has(k));
  for (const chave of voltaram) {
    await pushParaTodos({
      title: "✅ Importação voltou ao normal",
      body:
        chave === "meta_anuncios"
          ? "O gasto da Meta voltou a ser importado."
          : chave === "meta_faturas"
            ? "As faturas da Meta voltaram a ser lidas."
            : "O custo do WhatsApp voltou a ser lido.",
      url: chave === "whatsapp_custos" ? "/custos/whatsapp" : "/custos/trafego",
      tag: `alerta-${chave}`,
    });
    await supabase.from("integracao_alertas").delete().eq("chave", chave);
  }

  return NextResponse.json({ ok: true, alertas: alertas.map((a) => a.chave), avisados, voltaram });
}

export async function GET() {
  return rodar();
}

export async function POST() {
  return rodar();
}
