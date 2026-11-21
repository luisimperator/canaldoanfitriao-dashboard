// Testa a escolha de turma do /imersao e do /i/<codigo> com datas simuladas.
// Rodar: node scripts/testar-escolha-turma.mjs   (Node 22.18+: importa o .ts direto, type stripping)
import assert from "node:assert/strict";
import { destaqueAntes, escolherTurmaImersao, escolherTurmaPorCodigo } from "../src/lib/imersao-escolha.ts";

// Espelho das linhas de imersao_turmas em produção (21/11/2026).
const CODIGO_28 = "9kONSWKrmvGQ";
const turmas = [
  { turma_data: "2026-11-21", fim_domingo: "2026-11-22T18:00:00Z", ativa: true, codigo: null },
  { turma_data: "2026-11-28", fim_domingo: "2026-11-29T18:00:00Z", ativa: true, codigo: CODIGO_28 },
];
const em = (iso) => new Date(iso);
const resumo = (e) =>
  e.tipo === "turma" || e.tipo === "encerrada" ? `${e.tipo}:${e.turma.turma_data}` : e.tipo;

let ok = 0;
function caso(nome, obtido, esperado) {
  assert.equal(obtido, esperado, nome);
  ok++;
  console.log(`ok  ${nome} -> ${obtido}`);
}

// (a) e (b): /imersao ainda na turma 21
caso("(a) /imersao 2026-11-21T12:30Z", resumo(escolherTurmaImersao(turmas, em("2026-11-21T12:30:00Z"))), "turma:2026-11-21");
caso("(b) /imersao 2026-11-22T17:59Z", resumo(escolherTurmaImersao(turmas, em("2026-11-22T17:59:00Z"))), "turma:2026-11-21");
caso("(b') /imersao exatamente no fim 18:00Z", resumo(escolherTurmaImersao(turmas, em("2026-11-22T18:00:00Z"))), "turma:2026-11-21");
// (c): depois do fim da 21 -> encerrada, NUNCA a 28 (que tem codigo)
caso("(c) /imersao 2026-11-22T18:01Z", resumo(escolherTurmaImersao(turmas, em("2026-11-22T18:01:00Z"))), "encerrada:2026-11-21");
caso("(c') /imersao 2026-11-28T13:00Z (durante a 28)", resumo(escolherTurmaImersao(turmas, em("2026-11-28T13:00:00Z"))), "encerrada:2026-11-21");
caso("(c'') /imersao sem nenhuma turma antiga", resumo(escolherTurmaImersao(turmas.filter((t) => t.codigo), em("2026-11-28T13:00:00Z"))), "sem_turma");
// (d): /i/<codigo da 28> presa à 28
for (const iso of ["2026-11-21T12:30:00Z", "2026-11-22T18:01:00Z", "2026-11-28T13:00:00Z", "2026-11-29T17:59:00Z"]) {
  caso(`(d) /i/${CODIGO_28} ${iso}`, resumo(escolherTurmaPorCodigo(turmas, CODIGO_28, em(iso))), "turma:2026-11-28");
}
// fim_domingo da 28 no banco é 2026-11-29T18:00Z: até lá ainda é a 28; depois, encerrada.
caso(`(d) /i/${CODIGO_28} 2026-11-29T18:00Z (fim exato)`, resumo(escolherTurmaPorCodigo(turmas, CODIGO_28, em("2026-11-29T18:00:00Z"))), "turma:2026-11-28");
caso(`(d) /i/${CODIGO_28} 2026-11-29T18:01Z`, resumo(escolherTurmaPorCodigo(turmas, CODIGO_28, em("2026-11-29T18:01:00Z"))), "encerrada:2026-11-28");
caso(`(d) /i/${CODIGO_28} 2026-12-05T13:00Z`, resumo(escolherTurmaPorCodigo(turmas, CODIGO_28, em("2026-12-05T13:00:00Z"))), "encerrada:2026-11-28");
// (e): codigo errado -> 404 (inclui caixa diferente e vazio)
caso("(e) /i/codigo-errado", resumo(escolherTurmaPorCodigo(turmas, "codigo-errado", em("2026-11-28T13:00:00Z"))), "nao_encontrada");
caso("(e) /i/<codigo em minúsculas>", resumo(escolherTurmaPorCodigo(turmas, CODIGO_28.toLowerCase(), em("2026-11-28T13:00:00Z"))), "nao_encontrada");
caso("(e) /i/ vazio", resumo(escolherTurmaPorCodigo(turmas, "", em("2026-11-28T13:00:00Z"))), "nao_encontrada");

// Faixa da espera: "Começamos às 10:00" só no dia (início 28/11 13:00Z = 10:00 SP).
const ini28 = em("2026-11-28T13:00:00Z");
caso("faixa 21/11 08:45 SP (semana antes)", destaqueAntes(ini28, em("2026-11-21T11:45:00Z")), "Começa no próximo sábado");
caso("faixa 21/11 23:30 SP", destaqueAntes(ini28, em("2026-11-22T02:30:00Z")), "Começa no próximo sábado");
caso("faixa 25/11 (quarta)", destaqueAntes(ini28, em("2026-11-25T15:00:00Z")), "Começa no próximo sábado");
caso("faixa 27/11 (sexta)", destaqueAntes(ini28, em("2026-11-27T22:00:00Z")), "Começa amanhã");
caso("faixa 28/11 00:10 SP", destaqueAntes(ini28, em("2026-11-28T03:10:00Z")), "Começamos às 10:00");
caso("faixa 28/11 09:00 SP", destaqueAntes(ini28, em("2026-11-28T12:00:00Z")), "Começamos às 10:00");
caso("faixa 2 semanas antes", destaqueAntes(ini28, em("2026-11-14T15:00:00Z")), "Começa sábado, 28/11");

console.log(`\n${ok} casos ok`);
