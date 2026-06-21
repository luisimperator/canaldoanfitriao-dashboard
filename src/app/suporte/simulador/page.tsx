import Link from "next/link";
import { PageHeader } from "@/components/ui";
import { aiConfigured, supportModelName } from "@/lib/support-ai";
import { SimuladorChat } from "./SimuladorChat";

export const dynamic = "force-dynamic";

export default function SimuladorPage() {
  const enabled = aiConfigured();
  const model = supportModelName();
  return (
    <div>
      <PageHeader
        title="Modo Treino (IA)"
        subtitle="Fale como cliente e veja a IA responder; troque para Chefe pra corrigir (o cliente não vê) — a IA ajusta na hora e sugere uma regra pra você salvar no treinamento. Nada aqui vai pro WhatsApp."
      />
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <Link href="/suporte" className="text-sm text-slate-500 hover:text-slate-800">
          ← Voltar pro Suporte
        </Link>
        <span
          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${
            enabled ? "bg-slate-100 text-slate-600" : "bg-slate-100 text-slate-400"
          }`}
          title="Modelo da IA em uso (variável SUPPORT_AI_MODEL)"
        >
          <span className={`h-2 w-2 rounded-full ${enabled ? "bg-emerald-500" : "bg-slate-300"}`} />
          Modelo: <span className="font-semibold text-slate-700">{model}</span>
        </span>
      </div>

      {!enabled && (
        <div className="mb-4 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <strong>IA desligada:</strong> defina a variável <code>ANTHROPIC_API_KEY</code> no
          servidor para ativar o cérebro de atendimento. O restante da tela já funciona.
        </div>
      )}

      <SimuladorChat enabled={enabled} />

      <p className="mt-4 text-xs text-slate-400">
        Quando a IA precisa de uma ação interna (cancelamento, reembolso, brinde,
        etc.) ela abre um caso na <Link href="/suporte" className="underline">fila de
        handoff</Link> automaticamente.
      </p>
    </div>
  );
}
