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

// Gravação só com o time falando = o lead faltou (Fernando, 16/11). A
// transcrição da Teams marca quem fala ("[mm:ss] Nome: fala"); se todo mundo
// que falou é do time, ninguém do lado do lead entrou na sala. Do time: quem
// está na reunião com e-mail do mesmo domínio de um vendedor, ou cujo nome
// contém o nome de um vendedor ("Flávio Augusto dos Reis Baroni" contém
// "Flávio Reis"). A venda ligada à call e a nota #call do vendedor continuam
// valendo por cima disso no painel (painel_calls).
const semAcento = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

export function quemFalou(texto: string): string[] {
  const nomes = new Set<string>();
  for (const m of texto.matchAll(/^\[[\d:]+\] ([^:\n]+):/gm)) nomes.add(m[1].trim());
  return [...nomes];
}

export function soOTimeFalou(
  texto: string,
  participantes: { nome: string | null; email: string | null }[] | null,
  vendedores: { nome: string; email: string }[]
): boolean {
  const falaram = quemFalou(texto);
  if (!falaram.length) return false;
  const dominios = new Set(
    vendedores.map((v) => (v.email ?? "").split("@")[1]?.toLowerCase()).filter((d): d is string => !!d)
  );
  const doTime = new Set(
    (participantes ?? [])
      .filter((p) => dominios.has((p.email ?? "").split("@")[1]?.toLowerCase() ?? ""))
      .map((p) => semAcento(p.nome ?? ""))
      .filter(Boolean)
  );
  const nomesVendedores = vendedores.map((v) => semAcento(v.nome).split(" ").filter(Boolean)).filter((t) => t.length);
  return falaram.every((quem) => {
    const n = semAcento(quem);
    if (doTime.has(n)) return true;
    const tokens = new Set(n.split(" "));
    return nomesVendedores.some((t) => t.every((x) => tokens.has(x)));
  });
}
