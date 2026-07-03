import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { isSalesTeamTag } from "@/lib/leads";
import { extractUtm } from "@/lib/mailchimp-utm";

export const maxDuration = 60;

// Dia-calendário de São Paulo do opt-in (timestamp_opt vem em UTC; fatiar
// direto desloca inscrições da noite para o dia seguinte).
function spDay(iso: string): string | null {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(d);
}

// Importa inscritos da lista do Mailchimp como leads, lendo as TAGS de cada
// contato. Contatos com tag de time de vendas (lista-de-espera /
// gigantes-super-interessados / precisa de ajuda) entram como "lista_espera";
// os demais ficam "frio" (base / newsletter).
// Requer MAILCHIMP_API_KEY (formato xxxx-usNN) e MAILCHIMP_LIST_ID.
// Reconciliado por mailchimp_id; re-rodar atualiza tags/status sem duplicar
// e sem mexer em pipeline_stage/seller_id/source (que vêm do Unnichat).
// A classificação de tags do time de vendas mora em @/lib/leads.

// Modo só-leitura: lista as TAGS reais da audiência (nome + quantos contatos),
// sem gravar nada no banco. Serve para descobrir como as tags estão escritas
// no Mailchimp e ajustar a classificação em @/lib/leads sem ficar adivinhando.
// Cada tag vem marcada se a regra atual já a trata como time de vendas.
export async function GET() {
  const apiKey = process.env.MAILCHIMP_API_KEY;
  const listId = process.env.MAILCHIMP_LIST_ID;
  if (!apiKey || !listId) {
    return NextResponse.json(
      { error: "Configure MAILCHIMP_API_KEY e MAILCHIMP_LIST_ID." },
      { status: 501 }
    );
  }

  const dc = apiKey.split("-").pop();
  const auth = { Authorization: `Basic ${Buffer.from(`anystring:${apiKey}`).toString("base64")}` };

  // Schema dos merge fields da audiência (nome + tag), p/ saber o que existe
  // (VIDORIGEM, UTM, etc.) sem adivinhar.
  const mergeSchema = new Map<string, string>(); // tag -> nome
  try {
    const r = await fetch(
      `https://${dc}.api.mailchimp.com/3.0/lists/${listId}/merge-fields?count=100&fields=merge_fields.tag,merge_fields.name`,
      { headers: auth, cache: "no-store" }
    );
    if (r.ok) {
      const j = await r.json();
      for (const m of j.merge_fields ?? []) mergeSchema.set(String(m.tag), String(m.name ?? m.tag));
    }
  } catch {
    /* segue sem schema */
  }

  const counts = new Map<string, number>();
  const mfFilled = new Map<string, number>(); // merge tag -> quantos preenchidos
  const mfExamples = new Map<string, Set<string>>(); // merge tag -> exemplos
  let members = 0;
  let offset = 0;
  const pageSize = 1000;
  // Só os mais RECENTES (onde o UTM/origem dos vídeos aparece) — varrer os 44 mil
  // dá timeout. Uma página (mil) já basta pra descobrir os campos preenchidos.
  const SAMPLE_MAX = 1000;

  for (;;) {
    const url =
      `https://${dc}.api.mailchimp.com/3.0/lists/${listId}/members` +
      `?count=${pageSize}&offset=${offset}&sort_field=timestamp_opt&sort_dir=DESC` +
      `&fields=members.tags,members.merge_fields,total_items`;
    const res = await fetch(url, { headers: auth, cache: "no-store" });
    if (!res.ok) {
      const text = await res.text();
      return NextResponse.json({ error: `Mailchimp: ${text}` }, { status: 502 });
    }
    const json = await res.json();
    const page: {
      tags?: { id: number; name: string }[];
      merge_fields?: Record<string, unknown>;
    }[] = json.members ?? [];
    if (page.length === 0) break;
    for (const m of page) {
      members += 1;
      for (const t of m.tags ?? []) {
        counts.set(t.name, (counts.get(t.name) ?? 0) + 1);
      }
      for (const [k, v] of Object.entries(m.merge_fields ?? {})) {
        const val = v == null ? "" : typeof v === "string" ? v.trim() : String(v);
        if (val === "" || val === "0") continue;
        mfFilled.set(k, (mfFilled.get(k) ?? 0) + 1);
        const ex = mfExamples.get(k) ?? new Set<string>();
        if (ex.size < 6) ex.add(val.slice(0, 60));
        mfExamples.set(k, ex);
      }
    }
    offset += pageSize;
    if (offset >= (json.total_items ?? 0) || offset >= SAMPLE_MAX) break;
  }

  const tags = [...counts.entries()]
    .map(([name, count]) => ({ name, count, timeDeVendas: isSalesTeamTag(name) }))
    .sort((a, b) => b.count - a.count);

  // une o schema com o que veio preenchido nos membros
  const allTags = new Set<string>([...mergeSchema.keys(), ...mfFilled.keys()]);
  const mergeFields = [...allTags]
    .map((tag) => ({
      tag,
      name: mergeSchema.get(tag) ?? tag,
      filled: mfFilled.get(tag) ?? 0,
      examples: [...(mfExamples.get(tag) ?? [])],
    }))
    .sort((a, b) => b.filled - a.filled);

  // Persiste o resultado da leitura (pra inspeção/diagnóstico de atribuição),
  // já que o GET não escreve em lugar nenhum — assim dá pra revisar depois.
  try {
    const supa = getSupabaseAdmin();
    if (supa) {
      await supa.from("webhook_log").insert({
        source: "mailchimp_discovery",
        note: `${members} membros · ${mergeFields.length} merge fields`,
        body: { members, mergeFields, tagsTop: tags.slice(0, 30) },
      });
    }
  } catch {
    /* diagnóstico é best-effort */
  }

  return NextResponse.json({ ok: true, members, tags, mergeFields });
}

export async function POST() {
  const apiKey = process.env.MAILCHIMP_API_KEY;
  const listId = process.env.MAILCHIMP_LIST_ID;
  if (!apiKey || !listId) {
    return NextResponse.json(
      { error: "Configure MAILCHIMP_API_KEY e MAILCHIMP_LIST_ID." },
      { status: 501 }
    );
  }
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ error: "Supabase não configurado." }, { status: 501 });
  }

  const dc = apiKey.split("-").pop(); // datacenter vem no fim da key
  const auth = {
    Authorization: `Basic ${Buffer.from(`anystring:${apiKey}`).toString("base64")}`,
  };

  // Schema dos merge fields (tag interna -> nome humano) p/ saber qual campo é
  // utm_source/medium/campaign/content/term e vidorigem sem chumbar MMERGE12.
  const mergeSchema = new Map<string, string>();
  try {
    const r = await fetch(
      `https://${dc}.api.mailchimp.com/3.0/lists/${listId}/merge-fields?count=100&fields=merge_fields.tag,merge_fields.name`,
      { headers: auth, cache: "no-store" }
    );
    if (r.ok) {
      const j = await r.json();
      for (const m of j.merge_fields ?? []) mergeSchema.set(String(m.tag), String(m.name ?? m.tag));
    }
  } catch {
    /* sem schema mapeamos pela tag, melhor do que nada */
  }

  let imported = 0;
  let listaEspera = 0;
  let comUtm = 0;
  let offset = 0;
  const pageSize = 1000; // máximo do Mailchimp — menos requisições, cabe nos 60s

  for (;;) {
    const url =
      `https://${dc}.api.mailchimp.com/3.0/lists/${listId}/members` +
      `?count=${pageSize}&offset=${offset}` +
      `&fields=members.id,members.email_address,members.full_name,members.timestamp_opt,members.tags,members.merge_fields,total_items`;
    const res = await fetch(url, { headers: auth, cache: "no-store" });
    if (!res.ok) {
      const text = await res.text();
      return NextResponse.json({ error: `Mailchimp: ${text}` }, { status: 502 });
    }
    const json = await res.json();
    const members: {
      id: string;
      email_address: string;
      full_name: string;
      timestamp_opt: string;
      tags?: { id: number; name: string }[];
      merge_fields?: Record<string, unknown>;
    }[] = json.members ?? [];
    if (members.length === 0) break;

    const rows = members.map((m) => {
      const tagNames = (m.tags ?? []).map((t) => t.name);
      const salesTeam = tagNames.some(isSalesTeamTag);
      if (salesTeam) listaEspera += 1;
      // Origem do lead (o que o levou à landing page): utm_* + vidorigem.
      const utm = extractUtm(m.merge_fields, mergeSchema);
      if (utm) comUtm += 1;
      return {
        mailchimp_id: m.id,
        email: m.email_address,
        name: m.full_name || null,
        // dia SP do opt-in; sem timestamp_opt vai null e a RPC usa current_date
        // SÓ na inserção (lead existente nunca é re-datado).
        created_at: m.timestamp_opt ? spDay(m.timestamp_opt) : null,
        // source fica de fora: novos contatos herdam o default 'outro' e quem
        // já existe preserva a origem real (vinda do Unnichat). Antes o
        // Mailchimp carimbava 'meta_ads' em toda a base e poluía a origem.
        status: salesTeam ? "lista_espera" : "frio",
        extra: utm ? { tags: tagNames, utm } : { tags: tagNames },
      };
    });
    // upsert_mailchimp_leads (RPC) faz o merge sem clobbering: não rebaixa
    // status vindo do Unnichat/Eduzz (quente/convertido/perdido), une as tags
    // em vez de substituir o extra e preserva o created_at de quem já existe.
    const { error } = await supabase.rpc("upsert_mailchimp_leads", { p_rows: rows });
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    imported += rows.length;

    offset += pageSize;
    if (offset >= (json.total_items ?? 0)) break;
  }

  return NextResponse.json({ ok: true, imported, listaEspera, comUtm });
}
