import casesJson from "./cases.json";
import { FORCA, GRUPOS, SINONIMOS, type CaseCofre } from "./taxonomia";

// Cofre de Cases: os cases tirados das transcrições do canal (cases.json) e o
// que a página e o chat recebem.

export const CASES = casesJson as CaseCofre[];

/** JSON que vai dentro da página (no <script type="application/json">). */
export function dadosDaPagina(): string {
  return JSON.stringify({ cases: CASES, grupos: GRUPOS, forca: FORCA, sinonimos: SINONIMOS })
    .replace(/</g, "\\u003c")
    .replace(new RegExp(String.fromCharCode(0x2028), "g"), "\\u2028")
    .replace(new RegExp(String.fromCharCode(0x2029), "g"), "\\u2029");
}

const rotulos: Record<string, string> = {};
for (const g of GRUPOS) for (const [v, r] of Object.entries(g.valores)) rotulos[`${g.chave}:${v}`] = r;
const rot = (chave: string, vs: string[] | string | null | undefined) =>
  (Array.isArray(vs) ? vs : vs ? [vs] : []).map((v) => rotulos[`${chave}:${v}`] ?? v).join(", ");

/** Os cases num formato curto pro chat (um bloco por case). */
export function casesParaPrompt(): string {
  return CASES.map((c) =>
    [
      `[[${c.id}]] ${c.nome}${c.cidade ? ` (${[c.cidade, c.uf].filter(Boolean).join("/")})` : ""} · força ${c.forca} · ${rot("tipo", c.tipo)} · ${rot("aluno", c.aluno)} · ${c.fonte.tipo === "youtube" ? "vídeo do YouTube (dá pra mandar o link pro lead)" : "vídeo da área de membros (só pra mostrar na tela)"}`,
      `Título: ${c.titulo}`,
      c.quem ? `Quem: ${c.quem}` : null,
      c.antes ? `Antes: ${c.antes}` : null,
      c.depois ? `Depois: ${c.depois}` : null,
      c.numeros?.length ? `Números: ${c.numeros.join("; ")}` : null,
      c.citacao ? `Frase: "${c.citacao}"` : null,
      `Objeções: ${rot("objecoes", c.objecoes) || "-"} | Perfil: ${rot("perfil", c.perfil) || "-"} | Imóvel: ${rot("imovel", c.imovel) || "-"} | Problema: ${rot("dores", c.dores) || "-"} | Prova: ${rot("resultados", c.resultados) || "-"}`,
      c.como_usar ? `Como usar: ${c.como_usar}` : null,
      `Trecho: ${c.trecho.inicio}–${c.trecho.fim}`,
    ]
      .filter(Boolean)
      .join("\n")
  ).join("\n\n");
}
