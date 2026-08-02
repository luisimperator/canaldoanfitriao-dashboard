import Link from "next/link";
import { Card, PageHeader } from "@/components/ui";
import { getWhatsappConfig } from "@/lib/whatsapp";
import { Notificacoes } from "./Notificacoes";
import { Templates } from "./Templates";

export const dynamic = "force-dynamic";

// Avisos e templates.
//
// As duas coisas moram juntas porque uma depende da outra: o aviso de caso novo
// sai por template, já que quem recebe quase nunca está dentro da janela de 24h.

export default async function AvisosPage() {
  const cfg = await getWhatsappConfig();
  const pronto = Boolean(cfg.token && cfg.wabaId);

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <PageHeader
          title="Avisos e templates"
          subtitle="Quem é chamado quando um caso escala, e os textos aprovados pela Meta"
        />
        <Link
          href="/suporte"
          className="shrink-0 rounded-lg border border-slate-300 dark:border-white/15 px-3 py-1.5 text-sm font-semibold text-slate-700 dark:text-zinc-300 hover:bg-slate-50 dark:hover:bg-white/5"
        >
          ← Suporte
        </Link>
      </div>

      {!pronto && (
        <div className="mb-4 rounded-xl border border-amber-300 dark:border-amber-500/40 bg-amber-50 dark:bg-amber-500/10 p-4 text-sm text-amber-900 dark:text-amber-100">
          <p className="font-semibold">Falta credencial da Meta.</p>
          <p className="mt-1 text-[13px]">
            Sem token e WABA ID no Vault do Supabase, não dá pra listar nem criar template.
          </p>
        </div>
      )}

      <Card title="Quem recebe aviso de caso novo" className="mb-4">
        <p className="mb-3 text-xs text-slate-500 dark:text-zinc-400">
          Assim que a IA escala um caso, essas pessoas levam um toque no WhatsApp com o motivo, o
          cliente e o resumo. Ninguém precisa lembrar de abrir o painel. O botão verde pausa a
          pessoa sem apagar o cadastro (útil pra escala e férias), e os chips limitam quais motivos
          ela recebe — sem nenhum chip marcado, ela recebe todos.
        </p>
        <Notificacoes />
      </Card>

      <Card title="Templates aprovados pela Meta">
        <p className="mb-3 text-xs text-slate-500 dark:text-zinc-400">
          O WhatsApp só entrega mensagem livre nas 24h seguintes à última mensagem do cliente.
          Passou disso, só sai template aprovado — vale pra retomar conversa com cliente e vale pro
          aviso interno. <strong>Utilidade</strong> é para aviso e atendimento (aprova rápido e é
          mais barato); <strong>Marketing</strong> é para promoção, custa mais e só deve ir pra
          quem aceitou receber, senão a Meta derruba a qualidade do número.
        </p>
        <Templates />
      </Card>

      <p className="mt-4 text-xs text-slate-400 dark:text-zinc-500">
        O aviso interno usa o template <code>caso_suporte_novo</code> com três variáveis (motivo,
        cliente, resumo). Enquanto ele não estiver aprovado, o disparo falha em silêncio e o caso
        segue normal na fila do painel — nenhum atendimento quebra por causa disso. Depois de
        cadastrar alguém, use o botão “Testar” pra confirmar que a mensagem chega de verdade.
      </p>
    </div>
  );
}
