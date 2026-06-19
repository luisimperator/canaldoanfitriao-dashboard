import Link from "next/link";
import { PageHeader } from "@/components/ui";
import { aiConfigured } from "@/lib/support-ai";
import { SimuladorChat } from "./SimuladorChat";

export const dynamic = "force-dynamic";

export default function SimuladorPage() {
  const enabled = aiConfigured();
  return (
    <div>
      <PageHeader
        title="Simulador do atendimento (IA)"
        subtitle="Converse como se fosse um cliente e veja a IA responder usando o treinamento + a consulta do cliente. Nada aqui vai pro WhatsApp ainda — é um banco de testes."
      />
      <div className="mb-4 text-sm">
        <Link href="/suporte" className="text-slate-500 hover:text-slate-800">
          ← Voltar pro Suporte
        </Link>
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
