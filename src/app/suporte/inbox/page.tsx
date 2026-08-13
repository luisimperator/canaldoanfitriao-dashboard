import Link from "next/link";
import { PageHeader } from "@/components/ui";
import { SupportInbox } from "@/components/SupportInbox";
import { getWhatsappConfig } from "@/lib/whatsapp";

export const dynamic = "force-dynamic";

// Caixa de entrada do WhatsApp oficial (Cloud API).
//
// Enquanto o número não migrar, a tela fica vazia — é isso mesmo. Ela existe
// antes da migração de propósito: o número só deve sair do aplicativo quando
// já houver onde atender.

export default async function InboxPage() {
  const cfg = await getWhatsappConfig();
  const pronto = Boolean(cfg.token && cfg.phoneNumberId);
  const autoReply = cfg.autoReply;

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <PageHeader
          title="WhatsApp"
          subtitle="Conversas do WhatsApp oficial do suporte"
        />
        <Link
          href="/suporte"
          className="shrink-0 rounded-lg border border-slate-300 dark:border-white/15 px-3 py-1.5 text-sm font-semibold text-slate-700 dark:text-zinc-300 hover:bg-slate-50 dark:hover:bg-white/5"
        >
          ← Tickets
        </Link>
      </div>

      {!pronto ? (
        <div className="mb-4 rounded-xl border border-amber-300 dark:border-amber-500/40 bg-amber-50 dark:bg-amber-500/10 p-4 text-sm text-amber-900 dark:text-amber-100">
          <p className="font-semibold">WhatsApp oficial ainda não conectado.</p>
          <p className="mt-1 text-[13px] leading-relaxed">
            Faltam as credenciais da Cloud API (token permanente, id do número, app secret e
            verify token). Elas ficam no Vault do Supabase — não precisa mexer na Vercel. O
            webhook a cadastrar na Meta é{" "}
            <code className="rounded bg-black/10 px-1">/api/webhooks/whatsapp</code> (campo{" "}
            <em>messages</em>). Esta tela já funciona — assim que a primeira mensagem chegar, ela
            aparece aqui.
          </p>
        </div>
      ) : (
        <div
          className={`mb-4 rounded-lg px-3 py-2 text-xs ${
            autoReply
              ? "bg-violet-50 dark:bg-violet-500/10 text-violet-800 dark:text-violet-200"
              : "bg-slate-100 dark:bg-white/[0.06] text-slate-600 dark:text-zinc-300"
          }`}
        >
          {autoReply ? (
            <>
              <strong>IA respondendo.</strong> Ela para sozinha numa conversa assim que você
              responder na mão — e volta quando você religar no botão.
            </>
          ) : (
            <>
              <strong>Modo observação.</strong> As mensagens são guardadas e a IA fica calada
              (<code>WHATSAPP_AUTO_REPLY</code> desligado). Você responde por aqui normalmente.
            </>
          )}
        </div>
      )}

      <SupportInbox />

      <p className="mt-4 text-xs text-slate-400 dark:text-zinc-500">
        Atualiza a cada 10 segundos. Anexos (imagem, áudio, PDF) são baixados da Meta e guardados
        no Storage — o link da Meta expira em minutos, então o arquivo fica com a gente. Mensagem
        livre só é entregue dentro da janela de 24h desde a última mensagem do cliente; fora dela,
        o WhatsApp exige template aprovado.
      </p>
    </div>
  );
}
