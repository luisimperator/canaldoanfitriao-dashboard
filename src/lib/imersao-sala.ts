// Resposta dos links da sala da Imersão (/imersao e /i/<codigo>): a mesma
// página de espera, os mesmos horários e o mesmo 302 pra sala, só muda como a
// turma é escolhida (src/lib/imersao-escolha.ts).

import { NextResponse, type NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { TURMA_COLS, horaSP, registrarClique, repassarParams, turmaParaCompra, type Turma } from "@/lib/imersao";
import type { Escolha } from "@/lib/imersao-escolha";
import { diaHumano, horaHumana, paginaAviso, paginaEncerrada, paginaEspera } from "@/lib/imersao-pagina";

export type TurmaComCodigo = Turma & { codigo: string | null };

const COLS = `${TURMA_COLS}, codigo`;
const ABRE_ANTES_MS = 30 * 60 * 1000;

/** Turmas antigas (codigo IS NULL), candidatas do /imersao. */
export async function turmasSemCodigo(supabase: SupabaseClient): Promise<TurmaComCodigo[]> {
  const { data } = await supabase
    .from("imersao_turmas")
    .select(COLS)
    .is("codigo", null)
    .order("turma_data", { ascending: true });
  return (data as TurmaComCodigo[] | null) ?? [];
}

/** Turma de codigo exato (comparação case-sensitive no banco). */
export async function turmasPorCodigo(supabase: SupabaseClient, codigo: string): Promise<TurmaComCodigo[]> {
  if (!codigo) return [];
  const { data } = await supabase.from("imersao_turmas").select(COLS).eq("codigo", codigo).limit(1);
  return (data as TurmaComCodigo[] | null) ?? [];
}

export function naoEncontrado(): Response {
  return new Response("Not Found", {
    status: 404,
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
  });
}

export async function responderSala(
  req: NextRequest,
  supabase: SupabaseClient,
  escolha: Escolha<TurmaComCodigo>,
  agora: Date
): Promise<Response> {
  if (escolha.tipo === "nao_encontrada") return naoEncontrado();

  const params = req.nextUrl.searchParams;
  const turma = escolha.tipo === "sem_turma" ? null : escolha.turma;
  const clique = (momento: string, destino: string | null) =>
    registrarClique(supabase, { headers: req.headers, params }, {
      rota: "imersao",
      turma_data: turma?.turma_data ?? null,
      momento,
      destino,
    });

  if (escolha.tipo === "encerrada") {
    await clique("encerrada", null);
    return paginaEncerrada();
  }

  if (escolha.tipo === "sem_turma") {
    await clique("sem_turma", null);
    const proximo = turmaParaCompra(agora);
    return paginaAviso("A próxima turma ainda não abriu", [
      `A próxima Imersão está prevista para ${diaHumano(horaSP(proximo, 12).toISOString())}.`,
      "Guarde este link: é por ele que você entra na sala no dia.",
    ]);
  }

  const t = agora.getTime();
  const ms = (iso: string) => new Date(iso).getTime();
  const tt = escolha.turma;
  const dias = [
    { momento: "sabado", inicio: tt.inicio_sabado, fim: tt.fim_sabado, sala: tt.sala_url_sabado, abre: tt.sala_abre_sabado },
    { momento: "domingo", inicio: tt.inicio_domingo, fim: tt.fim_domingo, sala: tt.sala_url_domingo, abre: tt.sala_abre_domingo },
  ];
  // A sala abre 30 min antes do início, a não ser que a turma diga outra hora
  // (sala_abre_*; Fernando, 21/11: "Abra a sala só às 10:00 mesmo").
  const abreEm = (d: (typeof dias)[number]) => (d.abre ? ms(d.abre) : ms(d.inicio) - ABRE_ANTES_MS);

  for (const d of dias) {
    if (t >= abreEm(d) && t <= ms(d.fim)) {
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
  const antesDoSabado = t < ms(tt.inicio_sabado);
  const prox = antesDoSabado ? dias[0] : dias[1];
  await clique(antesDoSabado ? "antes" : "intervalo", null);
  // Página de espera com contagem, foto do Rômulo e a cara da LP (Fernando,
  // 20/11: inscrito via "a Imersão ainda não começou" e achava que o link não
  // funcionava; "coloca um countdown").
  const abreMs = abreEm(prox);
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
