// Raspagem Asaas → Inter.
//
// De tempos em tempos varre o saldo já liquidado no Asaas e manda via Pix pra
// conta do Inter, deixando um colchão pra tarifas. O dinheiro fica na conta que
// a gente controla (e que o dashboard lê no extrato), não parado no gateway.
//
// Variáveis de ambiente (Vercel) — sem a primeira, a raspagem não roda:
//   ASAAS_SWEEP_PIX_KEY       chave Pix da conta do Inter (destino)
//   ASAAS_SWEEP_PIX_KEY_TYPE  (opcional) CPF|CNPJ|EMAIL|PHONE|EVP — só quando
//                             o formato é ambíguo (11 dígitos: CPF ou celular)
//   ASAAS_SWEEP_KEEP_BRL      (opcional) colchão que fica no Asaas, default 100
//   ASAAS_SWEEP_MIN_BRL       (opcional) piso pra valer a transferência, default 500
//   ASAAS_TRANSFER_API_KEY    (opcional) chave com permissão de saque
//
// Toda tentativa — inclusive as puladas — vira linha em asaas_raspagens, que é
// o log auditável de dinheiro saindo.

import { getSupabaseAdmin } from "@/lib/supabase-admin";
import {
  createAsaasTransfer,
  fetchAsaasBalance,
  getAsaasConfig,
} from "@/lib/integrations/asaas";

export const PIX_KEY_TYPES = ["CPF", "CNPJ", "EMAIL", "PHONE", "EVP"] as const;
export type PixKeyType = (typeof PIX_KEY_TYPES)[number];

/**
 * Tipo da chave Pix pelo formato. null = ambíguo (11 dígitos tanto pode ser
 * CPF quanto celular) — nesse caso só com ASAAS_SWEEP_PIX_KEY_TYPE.
 */
export function inferPixKeyType(key: string): PixKeyType | null {
  const k = key.trim();
  if (k.includes("@")) return "EMAIL";
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(k)) return "EVP";
  if (k.startsWith("+")) return "PHONE";
  const digitos = k.replace(/\D/g, "");
  if (digitos.length === 14) return "CNPJ";
  return null;
}

export interface SweepDestino {
  pixAddressKey: string;
  pixAddressKeyType: PixKeyType;
}

/** Destino da raspagem a partir das envs. null = não configurado (fica inerte). */
export function resolveSweepDestino(): SweepDestino | null {
  const key = process.env.ASAAS_SWEEP_PIX_KEY?.trim();
  if (!key) return null;
  const bruto = (
    process.env.ASAAS_SWEEP_PIX_KEY_TYPE ||
    inferPixKeyType(key) ||
    "CNPJ"
  ).toUpperCase();
  const tipo: PixKeyType = (PIX_KEY_TYPES as readonly string[]).includes(bruto)
    ? (bruto as PixKeyType)
    : "CNPJ";
  return { pixAddressKey: key, pixAddressKeyType: tipo };
}

export interface RaspagemResult {
  ok: boolean;
  pulou?: boolean;
  motivo?: string;
  erro?: string;
  saldo?: number;
  colchao?: number;
  piso?: number;
  transferido?: number;
  transferId?: string;
  transferStatus?: string;
  levouMs: number;
}

/** Duas raspagens não podem sair coladas: o saldo do Asaas leva alguns
 *  segundos pra refletir a saída, e um cron que dispara duas vezes (retry,
 *  clock skew) sacaria de novo em cima do saldo velho. */
const JANELA_ANTI_DUPLICATA_MIN = 30;

/**
 * Executa UMA raspagem. `trigger` só nomeia a origem no log (cron/manual).
 *
 * O piso existe por causa da cota do Asaas: 30 Pix de saída grátis por mês.
 * Com 3 janelas diárias, transferir qualquer trocado estouraria a cota e o
 * resto do mês viraria tarifa.
 */
export async function runRaspagem(trigger: string): Promise<RaspagemResult> {
  const t0 = Date.now();
  const colchao = Math.max(parseFloat(process.env.ASAAS_SWEEP_KEEP_BRL ?? "100") || 100, 0);
  const piso = Math.max(parseFloat(process.env.ASAAS_SWEEP_MIN_BRL ?? "500") || 500, 1);
  const admin = getSupabaseAdmin();

  const registrar = async (r: RaspagemResult) => {
    if (!admin) return;
    try {
      await admin.from("asaas_raspagens").insert({
        trigger,
        ok: r.ok,
        pulou: r.pulou ?? false,
        motivo: r.motivo ?? null,
        erro: r.erro ?? null,
        saldo: r.saldo ?? null,
        colchao,
        piso,
        valor: r.transferido ?? null,
        transfer_id: r.transferId ?? null,
        transfer_status: r.transferStatus ?? null,
        levou_ms: r.levouMs,
      });
    } catch {
      // o log não pode derrubar a raspagem (nem mascarar o que já aconteceu)
    }
  };

  try {
    const destino = resolveSweepDestino();
    if (!destino) {
      const r: RaspagemResult = {
        ok: false,
        pulou: true,
        motivo: "ASAAS_SWEEP_PIX_KEY não configurada na Vercel",
        levouMs: Date.now() - t0,
      };
      await registrar(r);
      return r;
    }

    const cfg = getAsaasConfig();
    if (!cfg) {
      const r: RaspagemResult = {
        ok: false,
        pulou: true,
        motivo: "ASAAS_API_KEY não configurada",
        levouMs: Date.now() - t0,
      };
      await registrar(r);
      return r;
    }

    // Trava anti-duplicata: transferência recente demais, não repete.
    if (admin) {
      const desde = new Date(Date.now() - JANELA_ANTI_DUPLICATA_MIN * 60_000).toISOString();
      const { data: recente } = await admin
        .from("asaas_raspagens")
        .select("id, criada_em, valor")
        .not("transfer_id", "is", null)
        .gte("criada_em", desde)
        .limit(1);
      if (recente && recente.length > 0) {
        const r: RaspagemResult = {
          ok: true,
          pulou: true,
          motivo: `já houve transferência nos últimos ${JANELA_ANTI_DUPLICATA_MIN} min — não repete`,
          levouMs: Date.now() - t0,
        };
        await registrar(r);
        return r;
      }
    }

    const saldo = await fetchAsaasBalance(cfg);
    // Arredonda PRA BAIXO nos centavos: nunca deixa menos que o colchão por
    // erro de ponto flutuante.
    const valor = Math.floor((saldo - colchao) * 100) / 100;

    if (valor < piso) {
      const r: RaspagemResult = {
        ok: true,
        pulou: true,
        saldo,
        colchao,
        piso,
        motivo: `sobra de R$ ${Math.max(valor, 0).toFixed(2)} abaixo do piso de R$ ${piso.toFixed(2)} (poupa a cota de Pix grátis)`,
        levouMs: Date.now() - t0,
      };
      await registrar(r);
      return r;
    }

    const transfer = await createAsaasTransfer(cfg, {
      value: valor,
      operationType: "PIX",
      ...destino,
      description: `Raspagem pro Inter — colchão de R$ ${colchao.toFixed(2)} mantido no Asaas`,
    });

    const r: RaspagemResult = {
      ok: true,
      saldo,
      colchao,
      piso,
      transferido: valor,
      transferId: transfer.id,
      transferStatus: transfer.status,
      levouMs: Date.now() - t0,
    };
    await registrar(r);
    return r;
  } catch (e) {
    const r: RaspagemResult = {
      ok: false,
      erro: e instanceof Error ? e.message : "falha na raspagem",
      levouMs: Date.now() - t0,
    };
    await registrar(r);
    return r;
  }
}
