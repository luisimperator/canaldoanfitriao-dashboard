import { NextResponse } from "next/server";
import { getAccess } from "@/lib/supabase-server";
import { listWhatsappTemplates } from "@/lib/whatsapp";

// Templates aprovados pela Meta, para uso fora da janela de 24h.
// Lista direto da Graph API: o que vale é o status lá, não uma cópia local que
// envelhece (template reprovado depois continuaria aparecendo aqui).

export const dynamic = "force-dynamic";

export async function GET() {
  const access = await getAccess();
  if (!access.authed) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });

  const r = await listWhatsappTemplates();
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 502 });
  return NextResponse.json({ templates: r.templates ?? [] });
}
