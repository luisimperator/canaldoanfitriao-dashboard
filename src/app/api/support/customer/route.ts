import { NextRequest, NextResponse } from "next/server";
import { findCustomerSmart } from "@/lib/support";
import { getAccess } from "@/lib/supabase-server";

// GET /api/support/customer?q=...  (aceita ?email= por compatibilidade)
// Perfil 360 do cliente para o atendimento (humano ou IA). O `q` é coringa:
// e-mail, CPF, CNPJ ou nome completo — a busca decide sozinha.
//
// Autenticação (uma das duas):
//   - sessão logada no dashboard (uso interno pela própria tela de Suporte), ou
//   - header "Authorization: Bearer <SUPPORT_API_TOKEN>" (uso server-side pela
//     automação/IA — nunca expor esse token no cliente).
//
// Não é cacheado (Route Handlers não cacheiam por padrão).

export async function GET(req: NextRequest) {
  const q =
    req.nextUrl.searchParams.get("q")?.trim() ||
    req.nextUrl.searchParams.get("email")?.trim() ||
    "";
  if (!q) {
    return NextResponse.json(
      { error: "Informe 'q' (e-mail, CPF, CNPJ ou nome completo)." },
      { status: 400 }
    );
  }

  const token = process.env.SUPPORT_API_TOKEN;
  const auth = req.headers.get("authorization");
  const tokenOk = Boolean(token) && auth === `Bearer ${token}`;

  if (!tokenOk) {
    const access = await getAccess();
    if (!access.authed) {
      return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
    }
  }

  const result = await findCustomerSmart(q);
  if ("error" in result) {
    return NextResponse.json(result, { status: 501 });
  }
  return NextResponse.json(result);
}
