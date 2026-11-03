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
import { FiltroTags } from "@/components/FiltroTags";
import { CHANNEL_COLOR, CHANNEL_ORDER } from "@/lib/channels";
import { num } from "@/lib/format";
import { gravar, useGuardado } from "@/lib/guardado";
import { contarTags, somarOrigem, somarPorDia, type PorTags } from "@/lib/tag-groups";

// Tags tiradas ficam salvas neste navegador (ex.: quem sempre olha sem a Black).
const CHAVE_TAGS = "grafico-mql-tags-fora";
const CHAVE_MODO = "grafico-mql-modo";

// Abaixo disso a origem dos leads deixa de ser confiável (alarme de cobertura).
const COBERTURA_MINIMA = 60;

function br(d: string): string {
  return `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(2, 4)}`;
}

// Gráfico de MQLs (ou Leads) + origem dos leads, com UMA janela de datas: o que
// se escolhe no gráfico (dia/semana/mês/ano, últimos N ou datas exatas) vale
// também para a origem. As contagens chegam prontas por dia (e por conjunto de
// tags) do servidor; o recorte e o filtro de tags rodam aqui.
export function PainelMqlOrigem({
  hoje,
  porTags,
  faturamentoPorDia,
  legendaMql,
  funil,
}: {
  hoje: string;
  /** leads, MQLs e origem por dia, agrupados pelo conjunto de tags */
  porTags: PorTags;
  faturamentoPorDia?: Record<string, number>;
  legendaMql?: ReactNode;
  /** card que fica ao lado da origem (segue o período da página) */
  funil?: ReactNode;
}) {
  const [janela, setJanela] = useState<JanelaMql>(JANELA_MQL_PADRAO);
  const { de, ate } = intervaloDaJanelaMql(janela, hoje);
  // MQLs ↔ Leads e as tags tiradas ficam salvas neste navegador.
  const modoSalvo = useGuardado(CHAVE_MODO);
  const tagsSalvas = useGuardado(CHAVE_TAGS);
  const modo: "mqls" | "leads" = modoSalvo === "leads" ? "leads" : "mqls";
  const tiradas = useMemo(() => {
    try {
      const t = JSON.parse(tagsSalvas ?? "[]");
      return new Set<string>(Array.isArray(t) ? t.map(String) : []);
    } catch {
      return new Set<string>();
    }
  }, [tagsSalvas]);
  const mudarTiradas = (t: Set<string>) => gravar(CHAVE_TAGS, JSON.stringify([...t].sort()));
  const mudarModo = (m: "mqls" | "leads") => gravar(CHAVE_MODO, m);

  const porDia = useMemo(() => somarPorDia(porTags, modo, tiradas), [porTags, modo, tiradas]);
  const contagem = useMemo(() => contarTags(porTags, modo, de, ate), [porTags, modo, de, ate]);
  const rotulo = modo === "mqls" ? "MQL" : "lead";

  // A origem segue a mesma janela e as mesmas tags tiradas do gráfico.
  const origem = useMemo(() => {
    const { porCanal, total, rastreados } = somarOrigem(porTags, tiradas, de, ate);
    const data = CHANNEL_ORDER.filter((ch) => porCanal.has(ch)).map((ch) => ({
      name: ch,
      value: porCanal.get(ch) ?? 0,
      color: CHANNEL_COLOR[ch],
    }));
    return { data, total, rastreados };
  }, [porTags, tiradas, de, ate]);

  const cobertura = origem.total > 0 ? (origem.rastreados / origem.total) * 100 : null;
  const baixa = cobertura !== null && cobertura < COBERTURA_MINIMA;

  return (
    <>
      <Card title={modo === "mqls" ? "MQLs" : "Leads"} className="mb-4">
        <MqlHistoryChart
          porDia={porDia}
          hoje={hoje}
          faturamentoPorDia={faturamentoPorDia}
          janela={janela}
          onJanela={setJanela}
          rotulo={rotulo}
          controles={
            <>
              <div className="inline-flex rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-[#15121f] p-0.5">
                {(
                  [
                    ["mqls", "MQLs"],
                    ["leads", "Leads"],
                  ] as const
                ).map(([k, label]) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => mudarModo(k)}
                    aria-pressed={modo === k}
                    className={`rounded-md px-2.5 py-1 text-xs font-semibold transition-colors ${
                      modo === k
                        ? "bg-slate-900 dark:bg-violet-600 text-white"
                        : "text-slate-500 dark:text-zinc-400 hover:text-slate-800"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <FiltroTags tags={porTags.tags} contagem={contagem} tiradas={tiradas} onChange={mudarTiradas} />
            </>
          }
        />
        {modo === "mqls" ? (
          legendaMql
        ) : (
          <p className="text-xs text-slate-400 dark:text-zinc-500 mt-2">
            Leads = contatos que entraram, contados no dia em que entraram.
          </p>
        )}
        {tiradas.size > 0 && (
          <p className="text-xs text-violet-600 dark:text-violet-400 mt-1">
            Sem os leads com as tags: {[...tiradas].sort().join(", ")}.
          </p>
        )}
      </Card>

      <div className="grid lg:grid-cols-3 gap-4">
        <Card title="Origem dos leads">
          <p className="text-xs text-slate-500 dark:text-zinc-400 mb-2">
            {num(origem.total)} lead{origem.total === 1 ? "" : "s"}{" "}
            {de === ate ? `em ${br(de)}` : `de ${br(de)} a ${br(ate)}`}, no mesmo período
            {tiradas.size > 0 ? " e sem as mesmas tags" : ""} do gráfico acima
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
