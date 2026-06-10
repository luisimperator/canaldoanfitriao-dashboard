import { NextRequest, NextResponse } from "next/server";
import { parseStatement } from "@/lib/statement-parser";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

// Upload de extrato bancário (OFX ou CSV do Inter).
// Com Supabase configurado, grava os lançamentos em fin_transactions
// (deduplicados por FITID quando o arquivo é OFX). Sem Supabase, apenas
// devolve a prévia do que foi lido — útil para validar o arquivo em modo demo.

export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Envie o arquivo no campo 'file'." }, { status: 400 });
  }

  const content = await file.text();
  let parsed;
  try {
    parsed = parseStatement(file.name, content);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
  if (parsed.length === 0) {
    return NextResponse.json(
      { error: "Nenhum lançamento reconhecido no arquivo." },
      { status: 400 }
    );
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({
      ok: true,
      persisted: false,
      message: "Supabase não configurado: prévia gerada, nada foi salvo.",
      count: parsed.length,
      preview: parsed.slice(0, 20),
    });
  }

  const { data: sourceFile, error: fileError } = await supabase
    .from("fin_source_files")
    .insert({
      filename: file.name,
      file_type: file.name.toLowerCase().endsWith(".ofx") ? "ofx" : "csv",
      status: "processing",
    })
    .select("id")
    .single();
  if (fileError) {
    return NextResponse.json({ error: fileError.message }, { status: 500 });
  }

  const rows = parsed.map((t) => ({
    transaction_date: t.transactionDate,
    amount: t.amount,
    direction: t.direction,
    description: t.description,
    external_id: t.externalId,
    source_file_id: sourceFile.id,
  }));
  const { error } = await supabase
    .from("fin_transactions")
    .upsert(rows, { onConflict: "external_id", ignoreDuplicates: true });

  await supabase
    .from("fin_source_files")
    .update({
      status: error ? "error" : "done",
      error_message: error?.message ?? null,
      processed_at: new Date().toISOString(),
    })
    .eq("id", sourceFile.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, persisted: true, count: rows.length });
}
