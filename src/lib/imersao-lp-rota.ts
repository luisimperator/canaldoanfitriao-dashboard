import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { garantirTurma, horaSP, registrarClique, somaDias, turmaParaCompra, turmaPorData } from "@/lib/imersao";
import { lpHtml, PIXEL_PADRAO, type LpTurma, type Variante } from "@/lib/imersao-lp";
import { horaHumana } from "@/lib/imersao-pagina";

// Serve a LP de venda da Imersão A5E numa das versões (longa, curta).
//
// Mostra a turma à venda agora (próximo sábado cujo 9h ainda não chegou — a
// mesma regra que o webhook usa pra dar turma a quem compra), com contador.
// Cada visita vira um clique "lp" da turma, com a versão (teste de versões no
// painel). Os botões levam pra /comprar, que repassa as UTMs pro checkout.

export const LP_BASE = "/imersao-chuva-de-reservas-airbnb";

const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

// Hora em que a sala abre: a da turma (sala_abre_*) ou 30 min antes do início,
// igual ao /imersao (a FAQ dizia "30 minutos antes" mesmo com a sala abrindo às 10h).
function salaAbre(inicioSab: string, inicioDom: string, abreSab?: string | null, abreDom?: string | null): string {
  const abre = (inicio: string, abre?: string | null) => horaHumana(abre ?? new Date(new Date(inicio).getTime() - 30 * 60 * 1000).toISOString());
  const sab = abre(inicioSab, abreSab);
  const dom = abre(inicioDom, abreDom);
  return sab === dom ? `A sala abre às ${sab} nos dois dias.` : `A sala abre às ${sab} no sábado e às ${dom} no domingo.`;
}

function descreve(
  turma: string,
  inicioSab: string,
  fimSab: string,
  inicioDom: string,
  fimDom: string,
  abreSab?: string | null,
  abreDom?: string | null
): LpTurma {
  const [, m, d] = turma.split("-").map(Number);
  const dom = new Date(inicioDom);
  const dDom = Number(new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", day: "numeric" }).format(dom));
  const mDom = Number(new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", month: "numeric" }).format(dom));
  const dias = m === mDom ? `${d} e ${dDom} de ${MESES[m - 1]}` : `${d} de ${MESES[m - 1]} e ${dDom} de ${MESES[mDom - 1]}`;
  const dd = (n: number) => String(n).padStart(2, "0");
  return {
    turma,
    inicioSabado: inicioSab,
    dias,
    sabadoCurto: `${dd(d)}/${dd(m)}`,
    domingoCurto: `${dd(dDom)}/${dd(mDom)}`,
    horario: `${horaHumana(inicioSab)} às ${horaHumana(fimSab)}`,
    horarioDomingo: `${horaHumana(inicioDom)} às ${horaHumana(fimDom)}`,
    salaAbre: salaAbre(inicioSab, inicioDom, abreSab, abreDom),
  };
}

export async function servirLp(req: NextRequest, variante: Variante): Promise<Response> {
  const params = req.nextUrl.searchParams;
  const turmaData = turmaParaCompra(new Date());
  const supabase = getSupabaseAdmin();

  let t: LpTurma = descreve(
    turmaData,
    horaSP(turmaData, 10).toISOString(),
    horaSP(turmaData, 15).toISOString(),
    horaSP(somaDias(turmaData, 1), 9, 15).toISOString(),
    horaSP(somaDias(turmaData, 1), 15).toISOString()
  );
  if (supabase) {
    try {
      await garantirTurma(supabase, turmaData);
      const turma = await turmaPorData(supabase, turmaData);
      if (turma)
        t = descreve(
          turmaData,
          turma.inicio_sabado,
          turma.fim_sabado,
          turma.inicio_domingo,
          turma.fim_domingo,
          turma.sala_abre_sabado,
          turma.sala_abre_domingo
        );
      await registrarClique(supabase, { headers: req.headers, params }, {
        rota: "lp",
        turma_data: turmaData,
        momento: "visita",
        destino: null,
        variante,
      });
    } catch {
      /* a LP abre mesmo se o banco falhar */
    }
  }

  // Botão de compra: /comprar da LP, levando TODOS os parâmetros da visita
  // (utm_*, fbclid, gclid…) e a versão.
  const q = new URLSearchParams();
  for (const [k, v] of params) {
    if (k !== "v" && v) q.set(k, v);
  }
  if (variante !== "longa") q.set("v", variante);
  const comprar = `${LP_BASE}/comprar${q.size ? `?${q}` : ""}`;

  return new Response(lpHtml(t, comprar, process.env.IMERSAO_META_PIXEL_ID?.trim() || PIXEL_PADRAO, variante), {
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
  });
}
