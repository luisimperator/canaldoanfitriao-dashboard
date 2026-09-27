import { getSupabaseAdmin } from "@/lib/supabase-admin";

// Vendas uma a uma, Eduzz + TMB, pro "dia a dia" da tela de Vendas (RPC
// vendas_detalhadas, migração 0054). A tabela `sales` que o resto da tela usa
// é só Eduzz, então boleto parcelado da TMB sumia do painel.

export interface VendaDetalhe {
  dia: string;
  hora: string;
  plataforma: "Eduzz" | "TMB";
  produto: string;
  cliente: string;
  email: string | null;
  metodo: string;
  parcelas: number | null;
  valor: number;
  estornada: boolean;
}

export interface DiaDeVendas {
  dia: string;
  vendas: VendaDetalhe[];
  eduzz: number;
  tmb: number;
  estornos: number;
  bruto: number;
}

export async function getVendasPorDia(de: string, ate: string): Promise<DiaDeVendas[] | null> {
  const admin = getSupabaseAdmin();
  if (!admin) return null;
  const { data, error } = await admin.rpc("vendas_detalhadas", { p_de: de, p_ate: ate });
  if (error || !data) return null;

  const porDia = new Map<string, DiaDeVendas>();
  for (const r of data as VendaDetalhe[]) {
    const v: VendaDetalhe = { ...r, valor: Number(r.valor ?? 0) };
    const d =
      porDia.get(v.dia) ?? { dia: v.dia, vendas: [], eduzz: 0, tmb: 0, estornos: 0, bruto: 0 };
    d.vendas.push(v);
    if (v.estornada) d.estornos++;
    else {
      if (v.plataforma === "TMB") d.tmb++;
      else d.eduzz++;
      d.bruto += v.valor;
    }
    porDia.set(v.dia, d);
  }
  // mais recente primeiro
  return [...porDia.values()].sort((a, b) => b.dia.localeCompare(a.dia));
}
