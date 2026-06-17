/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

const OUTCOME_LABEL: Record<string, string> = {
  won: "FECHOU ✅",
  lost: "NÃO FECHOU (perdido) ❌",
  open: "EM ABERTO ⏳",
};

function brl(v: number): string {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function msgLine(m: any): string {
  const who =
    m.senderBy === "contact"
      ? "CLIENTE"
      : m.origin === "automation"
        ? "AUTOMAÇÃO"
        : "VENDEDOR";
  let text: string = m.message ?? "";
  if (!text && m.type === "template" && Array.isArray(m.templateComponents)) {
    text = m.templateComponents
      .filter((c: any) => c.type === "BODY")
      .map((c: any) => c.text)
      .join(" ");
  }
  const date = m.date ? new Date(m.date).toLocaleString("pt-BR") : "";
  return `- [${date}] **${who}:** ${String(text).replace(/\n/g, " ").trim()}`;
}

export async function GET(req: NextRequest) {
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Supabase não configurado." }, { status: 501 });

  const outcome = req.nextUrl.searchParams.get("outcome");
  const seller = req.nextUrl.searchParams.get("seller");

  let q = admin
    .from("conversations")
    .select("contact_name,email,phone,seller,outcome,messages,profile,last_at")
    .order("last_at", { ascending: false, nullsFirst: false });
  if (outcome && outcome !== "all") q = q.eq("outcome", outcome);
  if (seller && seller !== "all") q = q.eq("seller", seller);
  const from = req.nextUrl.searchParams.get("from");
  const to = req.nextUrl.searchParams.get("to");
  const reYMD = /^\d{4}-\d{2}(-\d{2})?$/;
  if (from && reYMD.test(from)) q = q.gte("last_at", from.length > 7 ? from : `${from}-01`);
  if (to && reYMD.test(to))
    q = q.lte("last_at", to.length > 7 ? `${to}T23:59:59` : `${to}-31T23:59:59`);
  const { data: convs } = await q;
  const rows = convs ?? [];

  // Joins por e-mail: Mailchimp (tags) + Eduzz (compras/valores).
  const emails = [...new Set(rows.map((r) => (r.email ?? "").toLowerCase()).filter(Boolean))];
  const mcTags = new Map<string, string[]>();
  const eduzz = new Map<string, any[]>();
  if (emails.length) {
    const { data: leads } = await admin.from("leads").select("email,extra").in("email", emails);
    for (const l of leads ?? []) {
      const t = (l.extra as any)?.tags;
      if (l.email && Array.isArray(t)) mcTags.set(l.email.toLowerCase(), t.map(String));
    }
    const { data: sales } = await admin.from("eduzz_sales_raw").select("email,data").in("email", emails);
    for (const s of sales ?? []) {
      if (!s.email) continue;
      const arr = eduzz.get(s.email) ?? [];
      arr.push(s.data);
      eduzz.set(s.email, arr);
    }
  }

  const parts: string[] = [];
  parts.push(`# Conversas do atendimento — perfil 360`);
  parts.push(
    `Filtro: resultado=${outcome ?? "todos"} · vendedor=${seller ?? "todos"} · ${rows.length} conversa(s) · gerado em ${new Date().toLocaleString("pt-BR")}\n`
  );

  for (const r of rows) {
    const email = (r.email ?? "").toLowerCase();
    const fields = ((r.profile as any)?.fields ?? {}) as Record<string, any>;
    const unnTags = (r.profile as any)?.tags ?? null;
    const sales = email ? eduzz.get(email) ?? [] : [];
    const ltv = sales.reduce((acc, s) => acc + Number(s?.total?.value ?? 0), 0);
    const tags = email ? mcTags.get(email) ?? [] : [];

    parts.push(`\n---\n`);
    parts.push(`## ${r.contact_name ?? "Sem nome"} — ${OUTCOME_LABEL[r.outcome ?? "open"] ?? r.outcome}`);
    parts.push(`**Vendedor:** ${r.seller ?? "—"} · **E-mail:** ${r.email ?? "—"} · **WhatsApp:** ${r.phone ?? "—"}`);

    // Perfil Unnichat (campos custom)
    const perfil: string[] = [];
    if (fields.faturamento) perfil.push(`Faturamento: ${fields.faturamento}`);
    if (fields["numero-imoveis"]) perfil.push(`Imóveis: ${fields["numero-imoveis"]}`);
    if (fields["tipo-imovel"]) perfil.push(`Tipo: ${fields["tipo-imovel"]}`);
    if (fields.dificuldade)
      perfil.push(`Dificuldades: ${Array.isArray(fields.dificuldade) ? fields.dificuldade.join("; ") : fields.dificuldade}`);
    if (perfil.length) parts.push(`**Perfil (Unnichat):** ${perfil.join(" · ")}`);
    if (unnTags) parts.push(`**Tags Unnichat:** ${unnTags}`);

    // Eduzz (compras)
    if (sales.length) {
      parts.push(`**Compras Eduzz (LTV ${brl(ltv)}):**`);
      for (const s of sales) {
        parts.push(
          `  - ${s?.product?.name ?? "produto"} — ${brl(Number(s?.total?.value ?? 0))} (${s?.status ?? "?"}, ${s?.paidAt ? new Date(s.paidAt).toLocaleDateString("pt-BR") : "—"})`
        );
      }
    } else {
      parts.push(`**Compras Eduzz:** nenhuma encontrada`);
    }

    // Mailchimp tags
    if (tags.length) parts.push(`**Tags Mailchimp:** ${tags.join(", ")}`);

    // Conversa
    const msgs = Array.isArray(r.messages) ? (r.messages as any[]) : [];
    parts.push(`\n**Conversa (${msgs.length} mensagens):**`);
    for (const m of msgs) parts.push(msgLine(m));
  }

  const md = parts.join("\n");
  const fname = `conversas_${outcome ?? "todos"}_${(seller ?? "todos").replace(/\s+/g, "-")}_${new Date().toISOString().slice(0, 10)}.md`;
  return new NextResponse(md, {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Content-Disposition": `attachment; filename="${fname}"`,
    },
  });
}
