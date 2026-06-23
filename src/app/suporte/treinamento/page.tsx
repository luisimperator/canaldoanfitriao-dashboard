import Link from "next/link";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { PageHeader } from "@/components/ui";
import type { KbItem } from "@/lib/support";
import { TreinamentoEditor } from "./TreinamentoEditor";

export const dynamic = "force-dynamic";

export default async function TreinamentoPage() {
  const admin = getSupabaseAdmin();
  let items: KbItem[] = [];
  if (admin) {
    const { data } = await admin
      .from("support_kb")
      .select("id,bloco,titulo,conteudo,ativo,ordem,updated_at,valido_ate")
      .order("bloco", { ascending: true })
      .order("ordem", { ascending: true });
    items = (data ?? []) as KbItem[];
  }

  return (
    <div>
      <PageHeader
        title="Treinamento da IA"
        subtitle="A base de conhecimento que o atendimento automático usa para responder. Organize por bloco; quanto melhor o conteúdo, mais casos a IA resolve sozinha."
      />
      <div className="mb-4 text-sm">
        <Link href="/suporte" className="text-slate-500 hover:text-slate-800">
          ← Voltar pro Suporte
        </Link>
      </div>
      <TreinamentoEditor initial={items} />
    </div>
  );
}
