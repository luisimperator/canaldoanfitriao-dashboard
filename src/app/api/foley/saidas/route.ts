import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { unnichat } from "@/lib/teo";

// Quem o robô de limpeza tirou do grupo (migração 0136). O Foley avisa aqui
// depois de cada remoção e o painel manda pra pessoa o template saida_aviso
// (Utilidade, aprovado em 20/11): "Oi, {{1}}! Aqui é o Téo, da equipe do
// Rômulo. Seu acesso ao {{2}} não foi renovado, por isso você saiu do grupo.
// Se achar que foi engano, responde aqui que a gente confere 💛".
// Reembolso/chargeback não recebe (não é "não foi renovado"). Uma linha por
// pessoa/grupo/dia: mandar de novo não repete o aviso.
//
// POST /api/foley/saidas
//   Authorization: Bearer <FOLEY_API_TOKEN>
//   { "pessoas": [{ "telefone": "5511...", "nome": "opcional", "grupo": "a5e" | "gigantes",
//                   "motivo": "assinatura cancelada", "removido_em": "ISO, opcional" }] }
// Resposta, na mesma ordem: aviso = enviado | ja_registrado | sem_aviso | erro, e o detalhe.

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const TEMPLATE_SAIDA_AVISO = "1012087258621434";
const PRODUTO = { a5e: "Anfitrião 5 Estrelas", gigantes: "Gigantes da Temporada" } as const;
const SEM_AVISO = /reembols|chargeback|estorno|contesta/i;

function autorizado(req: NextRequest): boolean {
  const token = process.env.FOLEY_API_TOKEN;
  return Boolean(token) && req.headers.get("authorization") === `Bearer ${token}`;
}

// O Foley manda o número do WhatsApp, que já vem com o código do país. Só põe
// 55 na frente do que tem cara de número brasileiro sem DDI: celular com 11
// dígitos (DDD + 9xxxx-xxxx) ou fixo com 10 (DDD + 2 a 5). Em 20/11 o Rudson
// (+1 240...) e a Marie (+33 6...) viraram 5512.../5533... e o aviso falhou.
function telefoneWhatsApp(bruto: string): string | null {
  let d = bruto.replace(/\D/g, "").replace(/^0+/, "");
  if ((d.length === 11 && d[2] === "9") || (d.length === 10 && /[2-5]/.test(d[2]))) d = `55${d}`;
  if (d.startsWith("55")) return /^55\d{10,11}$/.test(d) ? d : null;
  return /^\d{8,15}$/.test(d) ? d : null;
}

function primeiroNome(nome: string | null): string {
  const p = (nome ?? "").trim().split(/\s+/)[0] ?? "";
  if (!p || /\d|@/.test(p)) return "tudo bem";
  return p.charAt(0).toUpperCase() + p.slice(1).toLowerCase();
}

function diaSP(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date(iso));
}

export async function POST(req: NextRequest) {
  if (!autorizado(req)) return NextResponse.json({ ok: false, erro: "não autorizado" }, { status: 401 });
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ ok: false, erro: "banco não configurado" }, { status: 500 });

  let corpo: Record<string, unknown>;
  try {
    corpo = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, erro: "JSON inválido" }, { status: 400 });
  }
  const lista = Array.isArray(corpo.pessoas) ? corpo.pessoas.slice(0, 100) : null;
  if (!lista || !lista.length) {
    return NextResponse.json({ ok: false, erro: "envie {\"pessoas\": [...]}" }, { status: 400 });
  }

  const resultados: Record<string, unknown>[] = [];
  for (const [i, bruto] of lista.entries()) {
    const p = (bruto ?? {}) as Record<string, unknown>;
    const telefone = telefoneWhatsApp(String(p.telefone ?? ""));
    const g = String(p.grupo ?? "").toLowerCase();
    const grupo = g.startsWith("gig") ? "gigantes" : g === "a5e" ? "a5e" : null;
    if (!telefone || !grupo) {
      resultados.push({ i, aviso: "erro", detalhe: !telefone ? "telefone inválido" : "grupo tem que ser a5e ou gigantes" });
      continue;
    }
    const nome = typeof p.nome === "string" ? p.nome.trim().slice(0, 120) || null : null;
    const motivo = typeof p.motivo === "string" ? p.motivo.trim().slice(0, 200) || null : null;
    const removidoEm =
      typeof p.removido_em === "string" && !Number.isNaN(Date.parse(p.removido_em))
        ? new Date(p.removido_em).toISOString()
        : new Date().toISOString();
    const chave = `${telefone}|${grupo}|${diaSP(removidoEm)}`;

    const { data: nova, error } = await supabase
      .from("foley_saidas")
      .insert({ chave, telefone, nome, grupo, motivo, removido_em: removidoEm, payload: p })
      .select("id")
      .maybeSingle();
    if (error) {
      if (/duplicate|unique/i.test(error.message)) {
        const { data: velha } = await supabase
          .from("foley_saidas")
          .select("aviso_status, aviso_detalhe")
          .eq("chave", chave)
          .maybeSingle();
        resultados.push({ i, aviso: "ja_registrado", detalhe: velha?.aviso_status ?? null });
      } else {
        resultados.push({ i, aviso: "erro", detalhe: error.message });
      }
      continue;
    }

    if (motivo && SEM_AVISO.test(motivo)) {
      await supabase
        .from("foley_saidas")
        .update({ aviso_status: "sem_aviso", aviso_detalhe: "reembolso/chargeback: sem saida_aviso" })
        .eq("id", nova!.id);
      resultados.push({ i, aviso: "sem_aviso", detalhe: "reembolso/chargeback" });
      continue;
    }

    try {
      const r = await unnichat(supabase, "POST", "/meta/templates", {
        phone: telefone,
        templateId: TEMPLATE_SAIDA_AVISO,
        bodyParameters: [
          { type: "text", text: primeiroNome(nome) },
          { type: "text", text: PRODUTO[grupo] },
        ],
      });
      const ok = r.status >= 200 && r.status < 300;
      const detalhe = ok ? null : `${r.status} ${JSON.stringify(r.body).slice(0, 200)}`;
      await supabase
        .from("foley_saidas")
        .update({ aviso_status: ok ? "enviado" : "erro", aviso_em: new Date().toISOString(), aviso_detalhe: detalhe })
        .eq("id", nova!.id);
      resultados.push({ i, aviso: ok ? "enviado" : "erro", detalhe });
    } catch (e) {
      const detalhe = String(e).slice(0, 200);
      await supabase.from("foley_saidas").update({ aviso_status: "erro", aviso_detalhe: detalhe }).eq("id", nova!.id);
      resultados.push({ i, aviso: "erro", detalhe });
    }
  }

  return NextResponse.json({ ok: true, resultados });
}
