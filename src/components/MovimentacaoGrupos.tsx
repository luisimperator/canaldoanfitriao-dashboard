"use client";

import { useMemo, useState } from "react";
import { Card } from "@/components/ui";
import { JANELA_MQL_PADRAO, MqlHistoryChart, intervaloDaJanelaMql, type JanelaMql } from "@/components/charts";
import { gravar, useGuardado } from "@/lib/guardado";

export type GrupoChave = "a5e" | "gigantes";

export const GRUPO_NOME: Record<GrupoChave, string> = {
  a5e: "[Membros] Anfitriões 5⭐",
  gigantes: "Gigantes da Temporada",
};

const CHAVE_FILTRO = "grafico-grupos-filtro";

// Abre no "Dia, últimos 30": o grupo mexe todo dia e a semana esconde os picos
// (aula, live, lançamento).
const JANELA_PADRAO: JanelaMql = {
  ...JANELA_MQL_PADRAO,
  gran: "dia",
  janelas: { ...JANELA_MQL_PADRAO.janelas, dia: 30 },
};

// Mensagens por dia nos grupos de membros, no mesmo gráfico dos Leads da Visão
// geral (dia/semana/mês, últimos N, datas, linha de média). O filtro escolhe
// os dois grupos somados ou um só, e fica salvo neste navegador.
export function MovimentacaoGrupos({
  hoje,
  porGrupo,
}: {
  hoje: string;
  /** mensagens por dia (YYYY-MM-DD -> n), por grupo */
  porGrupo: Record<GrupoChave, Record<string, number>>;
}) {
  const [janela, setJanela] = useState<JanelaMql>(JANELA_PADRAO);
  const salvo = useGuardado(CHAVE_FILTRO);
  const filtro: "todos" | GrupoChave = salvo === "a5e" || salvo === "gigantes" ? salvo : "todos";
  const { de, ate } = intervaloDaJanelaMql(janela, hoje);

  const porDia = useMemo(() => {
    if (filtro !== "todos") return porGrupo[filtro];
    const soma: Record<string, number> = {};
    for (const g of Object.keys(porGrupo) as GrupoChave[]) {
      for (const [d, n] of Object.entries(porGrupo[g])) soma[d] = (soma[d] ?? 0) + n;
    }
    return soma;
  }, [porGrupo, filtro]);

  // Quanto cada grupo mandou na mesma janela do gráfico.
  const naJanela = useMemo(() => {
    const out = {} as Record<GrupoChave, number>;
    for (const g of Object.keys(porGrupo) as GrupoChave[]) {
      out[g] = Object.entries(porGrupo[g]).reduce((a, [d, n]) => (d >= de && d <= ate ? a + n : a), 0);
    }
    return out;
  }, [porGrupo, de, ate]);

  const opcoes: ["todos" | GrupoChave, string][] = [
    ["todos", "Os dois"],
    ["a5e", "A5E"],
    ["gigantes", "Gigantes"],
  ];

  return (
    <Card title="Mensagens por dia nos grupos" className="mb-4">
      <MqlHistoryChart
        porDia={porDia}
        hoje={hoje}
        janela={janela}
        onJanela={setJanela}
        rotulo="mensagem"
        rotuloPlural="mensagens"
        controles={
          <div className="inline-flex rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-surface p-0.5">
            {opcoes.map(([k, label]) => (
              <button
                key={k}
                type="button"
                onClick={() => gravar(CHAVE_FILTRO, k)}
                aria-pressed={filtro === k}
                className={`rounded-md px-2.5 py-1 text-xs font-semibold transition-colors ${
                  filtro === k
                    ? "bg-slate-900 dark:bg-zinc-100 dark:text-zinc-900 text-white"
                    : "text-slate-500 dark:text-zinc-400 hover:text-slate-800"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        }
      />
      <p className="text-xs text-slate-400 dark:text-zinc-500 mt-2">
        No mesmo período: {GRUPO_NOME.a5e} {naJanela.a5e.toLocaleString("pt-BR")} · {GRUPO_NOME.gigantes}{" "}
        {naJanela.gigantes.toLocaleString("pt-BR")}. Conta toda mensagem enviada no grupo (texto, áudio,
        foto, vídeo, figurinha), de qualquer pessoa; reação não conta. Dia de hoje entra amanhã às 00h10.
      </p>
    </Card>
  );
}
