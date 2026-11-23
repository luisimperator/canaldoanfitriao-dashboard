import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { acessoAssinaturas } from "@/lib/assinaturas-painel";

// Formulário "Registrar ocorrência" da aba Assinaturas (/internos/assinaturas).
// Exige sessão do painel (o porteiro já barra /api sem login) e a aba
// liberada (admin ou aba marcada em Usuários; ver acessoAssinaturas);
// grava em assinatura_ocorrencias (migração 0146) com o e-mail de quem
// registrou e volta pra página.

export const dynamic = "force-dynamic";

const TIPOS = new Set(["troca_numero", "pessoa_adicional", "observacao"]);
const PAGINA = "/internos/assinaturas";

function texto(v: FormDataEntryValue | null, max = 500): string | null {
  const s = typeof v === "string" ? v.trim().slice(0, max) : "";
  return s ? s : null;
}

function telefone(v: FormDataEntryValue | null): string | null {
  const s = texto(v, 40);
  if (!s) return null;
  const d = s.replace(/\D/g, "");
  return d ? `+${d}` : null;
}

function voltar(req: NextRequest, q: Record<string, string>) {
  const u = new URL(PAGINA, req.url);
  for (const [k, v] of Object.entries(q)) u.searchParams.set(k, v);
  u.hash = "ocorrencias";
  return NextResponse.redirect(u, 303);
}

export async function POST(req: NextRequest) {
  const access = await acessoAssinaturas();
  if (!access.ok) {
    return NextResponse.json({ error: "sem acesso" }, { status: 403 });
  }
  const admin = getSupabaseAdmin();
  if (!admin) return voltar(req, { erro: "banco indisponível" });

  const f = await req.formData();
  const tipo = texto(f.get("tipo"), 30) ?? "";
  if (!TIPOS.has(tipo)) return voltar(req, { erro: "tipo inválido" });
  const nome = texto(f.get("nome"), 200);
  if (!nome) return voltar(req, { erro: "falta o nome do aluno" });
  const numeroAntigo = telefone(f.get("numero_antigo"));
  const numeroNovo = telefone(f.get("numero_novo"));
  const pessoa = texto(f.get("pessoa_adicional"), 200);
  const obs = texto(f.get("observacao"), 2000);
  if (tipo === "troca_numero" && (!numeroAntigo || !numeroNovo)) {
    return voltar(req, { erro: "troca de número precisa do número antigo e do novo" });
  }
  if (tipo === "pessoa_adicional" && !pessoa && !numeroNovo) {
    return voltar(req, { erro: "pessoa adicional precisa do nome ou do número dela" });
  }
  if (tipo === "observacao" && !obs) return voltar(req, { erro: "falta a observação" });
  const data = texto(f.get("data_ocorrencia"), 10);

  const { error } = await admin.from("assinatura_ocorrencias").insert({
    tipo,
    nome,
    email: texto(f.get("email"), 200)?.toLowerCase() ?? null,
    produto: texto(f.get("produto"), 200),
    numero_antigo: numeroAntigo,
    numero_novo: numeroNovo,
    pessoa_adicional: pessoa,
    observacao: obs,
    ...(data && /^\d{4}-\d{2}-\d{2}$/.test(data) ? { data_ocorrencia: data } : {}),
    registrado_por: access.email ?? "painel",
    origem: "painel",
  });
  if (error) return voltar(req, { erro: "falha ao gravar" });
  return voltar(req, { ok: "1" });
}
