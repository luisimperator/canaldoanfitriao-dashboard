import { getSupabaseAdmin } from "@/lib/supabase-admin";

// Vendido pelo time no período (Fernando, 21/11: "quanto foi vendido, tipo o
// painel calls, mas abrangendo tudo que qualquer vendedor tenha vendido, por
// email, mensagem, whatsapp ou call"). A regra está no banco, na função
// vendas_do_time (migração 0144): venda com o link do vendedor (UTM, Eduzz e
// TMB) ou ligada a uma call dele no Painel Calls.

export interface VendaDoTime {
  venda_id: string;
  origem: string;
  dia: string;
  valor: number;
  produto: string | null;
  vendedor: string;
  canal: "link" | "call" | "link+call";
}

export interface ResumoVendedor {
  vendedor: string;
  vendas: number;
  valor: number;
  emCall: number;
  tmb: number;
}

export interface VendidoPeloTime {
  vendas: number;
  valor: number;
  emCall: number;
  valorEmCall: number;
  soLink: number;
  valorSoLink: number;
  porOrigem: Record<string, number>;
  porVendedor: ResumoVendedor[];
}

export async function getVendidoPeloTime(de: string, ate: string): Promise<VendidoPeloTime | null> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return null;
  const { data, error } = await supabase.rpc("vendas_do_time", { p_de: de, p_ate: ate });
  if (error) return null;
  const linhas = ((data ?? []) as VendaDoTime[]).map((v) => ({ ...v, valor: Number(v.valor) }));

  const res: VendidoPeloTime = {
    vendas: linhas.length,
    valor: 0,
    emCall: 0,
    valorEmCall: 0,
    soLink: 0,
    valorSoLink: 0,
    porOrigem: {},
    porVendedor: [],
  };
  const mapa = new Map<string, ResumoVendedor>();
  for (const v of linhas) {
    res.valor += v.valor;
    const call = v.canal !== "link";
    if (call) {
      res.emCall++;
      res.valorEmCall += v.valor;
    } else {
      res.soLink++;
      res.valorSoLink += v.valor;
    }
    res.porOrigem[v.origem] = (res.porOrigem[v.origem] ?? 0) + v.valor;
    const r = mapa.get(v.vendedor) ?? { vendedor: v.vendedor, vendas: 0, valor: 0, emCall: 0, tmb: 0 };
    r.vendas++;
    r.valor += v.valor;
    if (call) r.emCall++;
    if (v.origem === "TMB") r.tmb++;
    mapa.set(v.vendedor, r);
  }
  res.porVendedor = [...mapa.values()].sort((a, b) => b.valor - a.valor);
  return res;
}
