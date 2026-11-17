import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { garantirTurma, horaSP, registrarClique, somaDias, turmaParaCompra, turmaPorData, UTM_KEYS } from "@/lib/imersao";
import { lpHtml, type LpTurma } from "@/lib/imersao-lp";
import { horaHumana } from "@/lib/imersao-pagina";

// LP de venda da Imersão A5E: link.canaldoanfitriao.com.br/imersao-chuva-de-reservas-airbnb
//
// Mostra a turma à venda agora (próximo sábado cujo 9h ainda não chegou — a
// mesma regra que o webhook usa pra dar turma a quem compra), com contador.
// Cada visita vira um clique "lp" da turma (topo do funil no painel). Os
// botões levam pra ./comprar, que repassa as UTMs pro checkout da Eduzz.

export const dynamic = "force-dynamic";

const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

function descreve(turma: string, inicioSab: string, fimSab: string, inicioDom: string): LpTurma {
  const [, m, d] = turma.split("-").map(Number);
  const dom = new Date(inicioDom);
  const dDom = Number(new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", day: "numeric" }).format(dom));
  const mDom = Number(new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", month: "numeric" }).format(dom));
  const dias = m === mDom ? `${d} e ${dDom} de ${MESES[m - 1]}` : `${d} de ${MESES[m - 1]} e ${dDom} de ${MESES[mDom - 1]}`;
  const dd = (n: number) => String(n).padStart(2, "0");
  return {
    inicioSabado: inicioSab,
    dias,
    sabadoCurto: `${dd(d)}/${dd(m)}`,
    domingoCurto: `${dd(dDom)}/${dd(mDom)}`,
    horario: `${horaHumana(inicioSab)} às ${horaHumana(fimSab)}`,
  };
}

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const turmaData = turmaParaCompra(new Date());
  const supabase = getSupabaseAdmin();

  let t: LpTurma = descreve(
    turmaData,
    horaSP(turmaData, 9).toISOString(),
    horaSP(turmaData, 16).toISOString(),
    horaSP(somaDias(turmaData, 1), 9).toISOString()
  );
  if (supabase) {
    try {
      await garantirTurma(supabase, turmaData);
      const turma = await turmaPorData(supabase, turmaData);
      if (turma) t = descreve(turmaData, turma.inicio_sabado, turma.fim_sabado, turma.inicio_domingo);
      await registrarClique(supabase, { headers: req.headers, params }, {
        rota: "lp",
        turma_data: turmaData,
        momento: "visita",
        destino: null,
      });
    } catch {
      /* a LP abre mesmo se o banco falhar */
    }
  }

  // Botão de compra: mesma pasta + /comprar, levando as UTMs da visita.
  const q = new URLSearchParams();
  for (const k of UTM_KEYS) {
    const v = params.get(k);
    if (v) q.set(k, v);
  }
  const comprar = `${req.nextUrl.pathname.replace(/\/+$/, "")}/comprar${q.size ? `?${q}` : ""}`;

  return new Response(lpHtml(t, comprar, process.env.IMERSAO_META_PIXEL_ID?.trim() || null), {
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
  });
}
