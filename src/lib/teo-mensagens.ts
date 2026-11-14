import type { MsgUnnichat } from "@/lib/teo";
import type { MsgExport } from "@/lib/teo-conversas-html";

// Mensagem do Unnichat no formato curto das telas de conversa do Téo (a
// exportação em HTML e o WhatsApp do Téo no painel): quem mandou, texto (com o
// corpo do template já preenchido), tipo, mídia e a transcrição do áudio.

export function textoTemplate(m: MsgUnnichat): string | null {
  const comps = Array.isArray(m.templateComponents) ? (m.templateComponents as Record<string, unknown>[]) : [];
  const corpo = comps.find((c) => String(c.type ?? "").toLowerCase() === "body");
  let txt = corpo && typeof corpo.text === "string" ? corpo.text : null;
  const params = Array.isArray(m.templateBodyParameters) ? (m.templateBodyParameters as Record<string, unknown>[]) : [];
  if (txt) {
    params.forEach((p, i) => {
      txt = txt!.split(`{{${i + 1}}}`).join(typeof p.text === "string" ? p.text : "");
    });
  }
  return txt;
}

export function converterMsg(m: MsgUnnichat, audios: Map<string, string>): MsgExport {
  const tx = m.type === "template" ? textoTemplate(m) : (m.message ?? "").trim() || null;
  let s: MsgExport["s"];
  if (m.senderBy === "platform") s = "p";
  else if (m.type === "note") s = "n";
  else if (m.senderBy === "contact") s = "c";
  else if (m.origin === "unniApi") s = "t";
  else if (m.origin === "automation" || m.type === "template" || m.type === "flow") s = "a";
  else s = "h";
  return { d: m.date, s, tx, ty: m.type || "message", u: m.url ?? null, tr: audios.get(m.id) ?? null };
}
