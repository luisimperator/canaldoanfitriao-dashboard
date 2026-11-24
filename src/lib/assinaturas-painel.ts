import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { getServerSupabase } from "@/lib/supabase-server";

// Dados da aba Assinaturas (/internos/assinaturas). Fonte: cópia da Eduzz no
// Supabase (assinaturas_eduzz, sincronizada pela API de assinaturas) e as
// faturas pagas (eduzz_sales_raw), juntadas pela função assin_painel_linhas
// (migração 0146). Dado de aluno: só servidor, service role.

export interface LinhaAssinatura {
  id: string;
  tipo: "assinatura" | "venda_unica";
  produto_id: string | null;
  produto: string | null;
  linha: string;
  status: string | null;
  situacao: "ativa" | "atrasada" | "cancelada" | "reembolsada" | "expirada" | null;
  inicio: string | null;
  vencimento: string | null;
  valor: number | null;
  email: string | null;
  nome: string | null;
  telefone: string | null;
  saida: string | null;
  acesso_ate: string | null;
  motivo_saida: string | null;
  faturas_pagas: number;
  pago: number;
  ltv_aluno: number;
  voltou: boolean;
}

export interface Ocorrencia {
  id: string;
  email: string | null;
  nome: string | null;
  produto: string | null;
  tipo: "troca_numero" | "pessoa_adicional" | "observacao";
  numero_antigo: string | null;
  numero_novo: string | null;
  pessoa_adicional: string | null;
  observacao: string | null;
  data_ocorrencia: string;
  registrado_por: string;
  origem: string;
  criado_em: string;
}

export const TIPO_OCORRENCIA: Record<Ocorrencia["tipo"], string> = {
  troca_numero: "Troca de número",
  pessoa_adicional: "Pessoa adicional",
  observacao: "Observação",
};

export function inativa(s: LinhaAssinatura["situacao"]): boolean {
  return s === "cancelada" || s === "reembolsada" || s === "expirada";
}

export async function carregarAssinaturas(): Promise<LinhaAssinatura[] | null> {
  const admin = getSupabaseAdmin();
  if (!admin) return null;
  const { data, error } = await admin.rpc("assin_painel_linhas");
  if (error || !Array.isArray(data)) return null;
  return (data as LinhaAssinatura[]).map((r) => ({
    ...r,
    valor: r.valor == null ? null : Number(r.valor),
    pago: Number(r.pago ?? 0),
    ltv_aluno: Number(r.ltv_aluno ?? 0),
    faturas_pagas: Number(r.faturas_pagas ?? 0),
  }));
}

export async function carregarOcorrencias(): Promise<Ocorrencia[]> {
  const admin = getSupabaseAdmin();
  if (!admin) return [];
  const { data } = await admin
    .from("assinatura_ocorrencias")
    .select("*")
    .order("data_ocorrencia", { ascending: false })
    .order("criado_em", { ascending: false })
    .limit(1000);
  return (data as Ocorrencia[]) ?? [];
}

// Telefone só com dígitos (com o + na frente quando vier com DDI).
export function soDigitos(v: string | null | undefined): string {
  return (v ?? "").replace(/\D/g, "");
}

// Quem pode ver a aba: admin, ou quem tem a aba liberada explicitamente em
// Usuários. Diferente do resto do painel, usuário SEM linha em app_access não
// entra aqui (dado de aluno). Devolve o e-mail de quem está logado.
export async function acessoAssinaturas(): Promise<{ ok: boolean; email: string | null }> {
  const sb = await getServerSupabase();
  const admin = getSupabaseAdmin();
  if (!sb || !admin) return { ok: false, email: null };
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) return { ok: false, email: null };
  const { data } = await admin.from("app_access").select("is_admin, tabs").eq("user_id", user.id).maybeSingle();
  const tabs = (data?.tabs as string[] | null) ?? [];
  const ok = !!data && (data.is_admin === true || tabs.includes("/internos/assinaturas"));
  return { ok, email: user.email ?? null };
}
