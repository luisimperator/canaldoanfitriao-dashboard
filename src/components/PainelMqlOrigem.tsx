"use client";

import { useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { Card } from "@/components/ui";
import {
  JANELA_MQL_PADRAO,
  MqlHistoryChart,
  SourcePie,
  intervaloDaJanelaMql,
  type JanelaMql,
} from "@/components/charts";
import { CHANNEL_COLOR, CHANNEL_ORDER } from "@/lib/channels";
import { num } from "@/lib/format";

// Abaixo disso a origem dos leads deixa de ser confiável (alarme de cobertura).
const COBERTURA_MINIMA = 60;

function br(d: string): string {
  return `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(2, 4)}`;
}

// Gráfico de MQLs + origem dos leads, com UMA janela de datas: o que se escolhe
// no gráfico (dia/semana/mês/ano, últimos N ou datas exatas) vale também para a
// origem. As contagens chegam prontas por dia do servidor; o recorte roda aqui.
export function PainelMqlOrigem({
  hoje,
  mqlPorDia,
  faturamentoPorDia,
  origemPorDia,
  rastreadosPorDia,
  legendaMql,
  funil,
}: {
  hoje: string;
  mqlPorDia: Record<string, number>;
  faturamentoPorDia?: Record<string, number>;
  /** leads criados por dia, por canal (classificação das UTMs) */
  origemPorDia: Record<string, Record<string, number>>;
  /** leads criados por dia com alguma UTM */
  rastreadosPorDia: Record<string, number>;
  legendaMql?: ReactNode;
  /** card que fica ao lado da origem (segue o período da página) */
  funil?: ReactNode;
}) {
  const [janela, setJanela] = useState<JanelaMql>(JANELA_MQL_PADRAO);
  const { de, ate } = intervaloDaJanelaMql(janela, hoje);

  const origem = useMemo(() => {
    const porCanal = new Map<string, number>();
    let total = 0;
    for (const [d, canais] of Object.entries(origemPorDia)) {
      if (d < de || d > ate) continue;
      for (const [ch, v] of Object.entries(canais)) {
        porCanal.set(ch, (porCanal.get(ch) ?? 0) + v);
        total += v;
      }
    }
    let rastreados = 0;
    for (const [d, v] of Object.entries(rastreadosPorDia)) if (d >= de && d <= ate) rastreados += v;
    const data = CHANNEL_ORDER.filter((ch) => porCanal.has(ch)).map((ch) => ({
      name: ch,
      value: porCanal.get(ch) ?? 0,
      color: CHANNEL_COLOR[ch],
    }));
    return { data, total, rastreados };
  }, [origemPorDia, rastreadosPorDia, de, ate]);

  const cobertura = origem.total > 0 ? (origem.rastreados / origem.total) * 100 : null;
  const baixa = cobertura !== null && cobertura < COBERTURA_MINIMA;

  return (
    <>
      <Card title="MQLs" className="mb-4">
        <MqlHistoryChart
          porDia={mqlPorDia}
          hoje={hoje}
          faturamentoPorDia={faturamentoPorDia}
          janela={janela}
          onJanela={setJanela}
        />
        {legendaMql}
      </Card>

      <div className="grid lg:grid-cols-3 gap-4">
        <Card title="Origem dos leads">
          <p className="text-xs text-slate-500 dark:text-zinc-400 mb-2">
            {num(origem.total)} lead{origem.total === 1 ? "" : "s"}{" "}
            {de === ate ? `em ${br(de)}` : `de ${br(de)} a ${br(ate)}`}, no mesmo período do gráfico de MQLs
          </p>
          {origem.total > 0 ? (
            <SourcePie data={origem.data} />
          ) : (
            <p className="text-sm text-slate-400 dark:text-zinc-500 py-8 text-center">Nenhum lead no período.</p>
          )}
          {cobertura !== null && (
            <p
              className={`text-xs mt-2 ${
                baixa ? "text-rose-600 dark:text-rose-400 font-semibold" : "text-slate-400 dark:text-zinc-500"
              }`}
            >
              {baixa ? "⚠ " : ""}
              {num(cobertura, 1)}% dos leads com origem rastreada ({num(origem.rastreados)} de{" "}
              {num(origem.total)}).{" "}
              <Link href="/origem" className="underline">
                Ver origem detalhada
              </Link>
            </p>
          )}
        </Card>
        {funil}
      </div>
    </>
  );
}
