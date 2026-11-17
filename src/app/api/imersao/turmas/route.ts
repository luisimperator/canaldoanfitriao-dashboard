import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { ehSabado, horaSP, somaDias } from "@/lib/imersao";

// Cria/edita turmas da Imersão A5E (tela Lançamento pago). Exige sessão (proxy).
// Horários chegam como "HH:MM" no horário de São Paulo; a data é a do sábado
// (e do domingo seguinte). Campo ausente = não mexe; vazio = limpa.

const URL_CAMPOS = ["sala_url_sabado", "sala_url_domingo", "grupo_vip_url", "grupo_vip_url_2"] as const;
const HORA_CAMPOS = [
  ["inicio_sabado", 0],
  ["fim_sabado", 0],
  ["inicio_domingo", 1],
  ["fim_domingo", 1],
] as const;

function montar(body: Record<string, unknown>, turma: string): { row: Record<string, unknown>; erro?: string } {
  const row: Record<string, unknown> = {};
  for (const k of URL_CAMPOS) {
    if (!(k in body)) continue;
    const v = String(body[k] ?? "").trim();
    if (v) {
      try {
        const u = new URL(v);
        if (!/^https?:$/.test(u.protocol)) throw new Error();
      } catch {
        return { row, erro: `${k}: URL inválida` };
      }
    }
    row[k] = v || null;
  }
  for (const [k, dia] of HORA_CAMPOS) {
    if (!(k in body)) continue;
    const v = String(body[k] ?? "").trim();
    if (!v) {
      row[k] = null; // o trigger volta pro padrão (9h/16h)
      continue;
    }
    const m = v.match(/^(\d{1,2}):(\d{2})$/);
    if (!m || +m[1] > 23 || +m[2] > 59) return { row, erro: `${k}: horário inválido (use HH:MM)` };
    row[k] = horaSP(somaDias(turma, dia), +m[1], +m[2]).toISOString();
  }
  for (const k of ["grupo_vip_cheio", "ativa"] as const) {
    if (k in body) row[k] = Boolean(body[k]);
  }
  if ("unnichat_tag_id" in body) row.unnichat_tag_id = String(body.unnichat_tag_id ?? "").trim() || null;
  return { row };
}

async function salvar(req: NextRequest, criar: boolean) {
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "Supabase não configurado." }, { status: 501 });
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }
  const turma = String(body.turma_data ?? req.nextUrl.searchParams.get("turma") ?? "").trim();
  if (!ehSabado(turma)) return NextResponse.json({ error: "A turma precisa ser um sábado (AAAA-MM-DD)." }, { status: 400 });

  const { row, erro } = montar(body, turma);
  if (erro) return NextResponse.json({ error: erro }, { status: 400 });

  if (criar) {
    const { data: existe } = await supabase.from("imersao_turmas").select("turma_data").eq("turma_data", turma).maybeSingle();
    if (existe) return NextResponse.json({ error: "Essa turma já existe — edite-a na lista." }, { status: 409 });
    const { error } = await supabase.from("imersao_turmas").insert({ turma_data: turma, ...row });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  } else {
    if (Object.keys(row).length === 0) return NextResponse.json({ ok: true });
    const { error, count } = await supabase
      .from("imersao_turmas")
      .update(row, { count: "exact" })
      .eq("turma_data", turma);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!count) return NextResponse.json({ error: "Turma não encontrada." }, { status: 404 });
  }

  const { data: t } = await supabase
    .from("imersao_turmas")
    .select("inicio_sabado, fim_sabado, inicio_domingo, fim_domingo")
    .eq("turma_data", turma)
    .maybeSingle();
  if (t && (t.fim_sabado <= t.inicio_sabado || t.fim_domingo <= t.inicio_domingo)) {
    return NextResponse.json({ ok: true, aviso: "Atenção: o fim está antes do início em algum dos dias." });
  }
  return NextResponse.json({ ok: true });
}

export async function POST(req: NextRequest) {
  return salvar(req, true);
}

export async function PATCH(req: NextRequest) {
  return salvar(req, false);
}
