import type { DiaDeVendas } from "@/lib/vendas-dia";
import { brl, num } from "@/lib/format";

// Vendas por dia, Eduzz + TMB, com a lista de cada dia aberta no clique.
// Server component: <details> nativo, sem JS no cliente.

const DIA_SEMANA = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

function rotuloDia(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dow = DIA_SEMANA[new Date(y, m - 1, d).getDay()];
  return `${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")} ${dow}`;
}

const METODO: Record<string, string> = {
  creditCard: "cartão",
  pix: "Pix",
  bankslip: "boleto",
};

function metodo(m: string): string {
  return m
    .split(" + ")
    .map((x) => METODO[x] ?? x)
    .join(" + ");
}

export function VendasDiaADia({ dias, periodo }: { dias: DiaDeVendas[]; periodo: string }) {
  const total = dias.reduce(
    (a, d) => ({
      eduzz: a.eduzz + d.eduzz,
      tmb: a.tmb + d.tmb,
      estornos: a.estornos + d.estornos,
      bruto: a.bruto + d.bruto,
    }),
    { eduzz: 0, tmb: 0, estornos: 0, bruto: 0 }
  );
  const vendas = total.eduzz + total.tmb;

  return (
    <div>
      <p className="mb-3 text-xs text-slate-500 dark:text-zinc-400">
        {periodo}: <strong className="text-slate-800 dark:text-zinc-200">{num(vendas)} vendas</strong>{" "}
        ({num(total.eduzz)} Eduzz · {num(total.tmb)} TMB) · {brl(total.bruto)} bruto
        {total.estornos > 0 && <> · {num(total.estornos)} estornada(s), fora da conta</>}. Clique no
        dia pra ver quem comprou.
      </p>

      {dias.length === 0 ? (
        <p className="text-sm text-slate-500 dark:text-zinc-400">Nenhuma venda no período.</p>
      ) : (
        <div className="divide-y divide-slate-100 dark:divide-white/[0.06] rounded-lg border border-slate-200 dark:border-white/10">
          {dias.map((d) => (
            <details key={d.dia} className="group">
              <summary className="flex cursor-pointer list-none items-center gap-3 px-3 py-2 text-sm hover:bg-slate-50 dark:hover:bg-white/[0.03]">
                <span className="w-20 shrink-0 font-medium tabular-nums text-slate-800 dark:text-zinc-200">
                  {rotuloDia(d.dia)}
                </span>
                <span className="w-20 shrink-0 font-semibold tabular-nums text-slate-900 dark:text-zinc-100">
                  {num(d.eduzz + d.tmb)} {d.eduzz + d.tmb === 1 ? "venda" : "vendas"}
                </span>
                <span className="flex-1 text-xs text-slate-500 dark:text-zinc-400">
                  {num(d.eduzz)} Eduzz · {num(d.tmb)} TMB
                  {d.estornos > 0 && <span className="text-rose-600 dark:text-rose-400"> · {d.estornos} estornada</span>}
                </span>
                <span className="shrink-0 tabular-nums text-slate-700 dark:text-zinc-300">{brl(d.bruto)}</span>
                <span className="text-slate-400 transition-transform group-open:rotate-90">›</span>
              </summary>
              <div className="overflow-x-auto px-3 pb-3">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-left text-slate-400 dark:text-zinc-500">
                      <th className="py-1 pr-2 font-medium">Hora</th>
                      <th className="py-1 pr-2 font-medium">Cliente</th>
                      <th className="py-1 pr-2 font-medium">Produto</th>
                      <th className="py-1 pr-2 font-medium">Plataforma</th>
                      <th className="py-1 pr-2 font-medium">Pagamento</th>
                      <th className="py-1 text-right font-medium">Valor</th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.vendas.map((v, i) => (
                      <tr
                        key={i}
                        className={`border-t border-slate-50 dark:border-white/[0.04] ${
                          v.estornada ? "text-slate-400 line-through dark:text-zinc-600" : "text-slate-700 dark:text-zinc-300"
                        }`}
                      >
                        <td className="py-1 pr-2 tabular-nums">{v.hora}</td>
                        <td className="py-1 pr-2">{v.cliente}</td>
                        <td className="py-1 pr-2">{v.produto}</td>
                        <td className="py-1 pr-2">
                          <span
                            className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                              v.plataforma === "TMB"
                                ? "bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300"
                                : "bg-sky-100 text-sky-800 dark:bg-sky-500/15 dark:text-sky-300"
                            }`}
                          >
                            {v.plataforma}
                          </span>
                        </td>
                        <td className="py-1 pr-2">
                          {metodo(v.metodo)}
                          {v.parcelas && v.parcelas > 1 ? ` ${v.parcelas}x` : ""}
                        </td>
                        <td className="py-1 text-right tabular-nums">{brl(v.valor)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          ))}
        </div>
      )}
    </div>
  );
}
