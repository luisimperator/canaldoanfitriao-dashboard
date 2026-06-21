import { NextRequest, NextResponse } from "next/server";
import { runSupportAgent, type AgentMessage } from "@/lib/support-ai";
import { getAccess } from "@/lib/supabase-server";

// POST /api/support/agent
// Roda o cérebro de IA do suporte para uma mensagem do cliente.
// Body: { message: string, history?: {role:"user"|"assistant", content:string}[] }
//
// Auth: sessão logada (uso interno pelo simulador) ou Bearer SUPPORT_API_TOKEN
// (uso futuro pela automação do WhatsApp).

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const token = process.env.SUPPORT_API_TOKEN;
  const auth = req.headers.get("authorization");
  const tokenOk = Boolean(token) && auth === `Bearer ${token}`;
  if (!tokenOk) {
    const access = await getAccess();
    if (!access.authed) {
      return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
    }
  }

  let body: { message?: unknown; history?: unknown; supervisorNotes?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }

  const message = typeof body.message === "string" ? body.message.trim() : "";
  if (!message) {
    return NextResponse.json({ error: "message é obrigatório." }, { status: 400 });
  }

  const history: AgentMessage[] = Array.isArray(body.history)
    ? body.history
        .filter(
          (m): m is AgentMessage =>
            !!m &&
            typeof m === "object" &&
            (m as AgentMessage).role !== undefined &&
            typeof (m as AgentMessage).content === "string"
        )
        .map((m) => ({
          role: m.role === "assistant" ? "assistant" : "user",
          content: String(m.content),
        }))
    : [];

  const supervisorNotes: string[] = Array.isArray(body.supervisorNotes)
    ? body.supervisorNotes.filter((n): n is string => typeof n === "string")
    : [];

  try {
    const result = await runSupportAgent(message, history, supervisorNotes);
    return NextResponse.json(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "erro desconhecido";
    return NextResponse.json({ error: `Falha na IA: ${msg}` }, { status: 500 });
  }
}
