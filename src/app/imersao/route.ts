import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { horaSP, registrarClique, repassarParams, turmaAtiva, turmaParaCompra } from "@/lib/imersao";
import { diaHumano, horaHumana, paginaAviso, paginaEspera } from "@/lib/imersao-pagina";

// Link fixo da sala do evento: link.canaldoanfitriao.com.br/imersao
//
// Turma ativa = a de turma_data mais próxima com fim_domingo >= agora.
//  - sábado, de 30 min antes do início até o fim: 302 pra sala_url_sabado;
//  - domingo, idem, pra sala_url_domingo;
//  - fora disso: página curta dizendo quando a sala abre (atualiza sozinha).
// Repassa UTMs e, se vierem na URL, nome/e-mail/telefone pra sala.
// Cada acesso vira um clique em imersao_cliques (funil por turma).

export const dynamic = "force-dynamic";

const ABRE_ANTES_MS = 30 * 60 * 1000;

export async function GET(req: NextRequest) {
  const supabase = getSupabaseAdmin();
  const params = req.nextUrl.searchParams;
  const agora = new Date();

  if (!supabase) {
    return paginaAviso("Sala indisponível", ["Tente de novo em alguns minutos."]);
  }

  const turma = await turmaAtiva(supabase, agora);
  const clique = (momento: string, destino: string | null) =>
    registrarClique(supabase, { headers: req.headers, params }, {
      rota: "imersao",
      turma_data: turma?.turma_data ?? null,
      momento,
      destino,
    });

  if (!turma) {
    await clique("sem_turma", null);
    const proximo = turmaParaCompra(agora);
    return paginaAviso("A próxima turma ainda não abriu", [
      `A próxima Imersão está prevista para ${diaHumano(horaSP(proximo, 12).toISOString())}.`,
      "Guarde este link: é por ele que você entra na sala no dia.",
    ]);
  }

  const t = agora.getTime();
  const ms = (iso: string) => new Date(iso).getTime();
  const dias = [
    { momento: "sabado", inicio: turma.inicio_sabado, fim: turma.fim_sabado, sala: turma.sala_url_sabado },
    { momento: "domingo", inicio: turma.inicio_domingo, fim: turma.fim_domingo, sala: turma.sala_url_domingo },
  ];

  for (const d of dias) {
    if (t >= ms(d.inicio) - ABRE_ANTES_MS && t <= ms(d.fim)) {
      if (!d.sala) {
        await clique(d.momento, null);
        return paginaAviso("A sala abre em instantes", [
          "Estamos liberando o link da sala. Esta página atualiza sozinha.",
        ]);
      }
      const destino = repassarParams(params, d.sala);
      await clique(d.momento, destino);
      return NextResponse.redirect(destino, 302);
    }
  }

  // Fora das janelas: antes do sábado ou no intervalo entre os dias.
  const antesDoSabado = t < ms(turma.inicio_sabado);
  const prox = antesDoSabado ? dias[0] : dias[1];
  await clique(antesDoSabado ? "antes" : "intervalo", null);
  // Página de espera com contagem, foto do Rômulo e a cara da LP (Fernando,
  // 20/11: inscrito via "a Imersão ainda não começou" e achava que o link não
  // funcionava; "coloca um countdown").
  const abreMs = ms(prox.inicio) - ABRE_ANTES_MS;
  const dia = diaHumano(prox.inicio);
  const hhmm = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(prox.inicio));
  return paginaEspera({
    destaque: `${antesDoSabado ? "Começamos" : "Voltamos"} às ${hhmm}`,
    titulo: antesDoSabado ? "A Imersão ainda não começou." : "O primeiro dia terminou.",
    frase: antesDoSabado ? "Começa em:" : "O segundo começa em:",
    quando: `${dia.charAt(0).toUpperCase()}${dia.slice(1)}, das ${horaHumana(prox.inicio)} às ${horaHumana(prox.fim)}`,
    abreTexto: `A sala abre às ${horaHumana(abreMs)}.`,
    inicioMs: ms(prox.inicio),
    abreMs,
    agoraMs: t,
  });
}
