import { NextRequest, NextResponse } from "next/server";
import { getCustomer360 } from "@/lib/support";
import { getAccess } from "@/lib/supabase-server";

// GET /api/support/customer?email=...
// Perfil 360 do cliente para o atendimento (humano ou IA).
//
// Autenticação (uma das duas):
//   - sessão logada no dashboard (uso interno pela própria tela de Suporte), ou
//   - header "Authorization: Bearer <SUPPORT_API_TOKEN>" (uso server-side pela
//     automação/IA — nunca expor esse token no cliente).
//
// Não é cacheado (Route Handlers não cacheiam por padrão).

export async function GET(req: NextRequest) {
  const email = req.nextUrl.searchParams.get("email")?.trim() ?? "";
  if (!email) {
    return NextResponse.json({ error: "Parâmetro 'email' é obrigatório." }, { status: 400 });
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

  const result = await getCustomer360(email);
  if ("error" in result) {
    return NextResponse.json(result, { status: 501 });
  }
  return NextResponse.json(result);
}
