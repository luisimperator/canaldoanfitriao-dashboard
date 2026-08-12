import { getSupabaseAdmin } from "@/lib/supabase-admin";

// Retrato do saldo do Asaas no banco.
//
// A chave do Asaas só existe na Vercel, então quem consegue perguntar
// "quanto tem lá?" é o app. Só que a política de distribuição é SQL puro
// (politica_distribuicao) e precisa desse número pra fechar o caixa de hoje —
// daí o retrato: o app grava, o SQL lê. Ver 0044.
//
// Grava de dois lugares: o sync de hora em hora e a raspagem (que grava o
// resíduo logo depois de transferir, pra não deixar o retrato inflado durante
// a hora seguinte). Nunca derruba quem chamou: retrato é conveniência, não é
// o trabalho.

export async function registrarSaldoAsaas(
  saldo: number,
  origem: string
): Promise<void> {
  const admin = getSupabaseAdmin();
  if (!admin || !Number.isFinite(saldo)) return;
  try {
    await admin.from("asaas_saldo").upsert(
      {
        id: 1,
        saldo: Math.round(saldo * 100) / 100,
        atualizado_em: new Date().toISOString(),
        origem,
      },
      { onConflict: "id" }
    );
  } catch {
    // sem retrato a política simplesmente ignora o Asaas (lado seguro)
  }
}
