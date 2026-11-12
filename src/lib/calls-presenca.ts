// Presença da call pelo vendedor: nota na conversa do lead no Unnichat que
// começa com #call (a call aconteceu fora da sala do Teams) ou #faltou (o lead
// não apareceu). O resto da nota é o que rolou e aparece no Painel Calls.
// Lida pelo cron /api/sync/calls e gravada em teo_calls.presenca (fonte
// "nota"); a régua do painel está em painel_calls() (migração 0084).
//
// Só vale a nota que COMEÇA com a marca: a nota "📞 Call agora…" do Téo cita
// o #call na instrução pro vendedor e não pode contar.

export type Presenca = "realizada" | "falta";

const MARCA = /^\s*#\s*(call|faltou|falta)\b[\s:;,.\-–—]*/i;

export function marcaDaNota(texto: string | null | undefined): { presenca: Presenca; nota: string } | null {
  const t = texto ?? "";
  const m = t.match(MARCA);
  if (!m) return null;
  return {
    presenca: m[1].toLowerCase() === "call" ? "realizada" : "falta",
    nota: t.slice(m[0].length).trim().slice(0, 500),
  };
}

// A nota vale de 30 min antes do horário até 48h depois (ou até 30 min antes
// da próxima call do mesmo lead, se ele remarcou).
export const NOTA_ANTES_MS = 30 * 60_000;
export const NOTA_DEPOIS_MS = 48 * 3600_000;
