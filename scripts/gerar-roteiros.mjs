// Gera src/lib/roteiros/paginas.ts a partir dos HTML de src/lib/roteiros/.
// Edite o .html e rode: node scripts/gerar-roteiros.mjs
import { readFileSync, writeFileSync } from "node:fs";

const dir = new URL("../src/lib/roteiros/", import.meta.url);
const atual = readFileSync(new URL("atual.html", dir), "utf8");
const nova = readFileSync(new URL("nova.html", dir), "utf8");
const calculadora = readFileSync(new URL("calculadora.html", dir), "utf8");
const cofre = readFileSync(new URL("cofre.html", dir), "utf8");

writeFileSync(
  new URL("paginas.ts", dir),
  "// Gerado por scripts/gerar-roteiros.mjs a partir de atual.html, nova.html, calculadora.html e cofre.html. Não edite à mão.\n" +
    `export const ROTEIRO_ATUAL_HTML = ${JSON.stringify(atual)};\n` +
    `export const ROTEIRO_NOVA_HTML = ${JSON.stringify(nova)};\n` +
    `export const CALCULADORA_HTML = ${JSON.stringify(calculadora)};\n` +
    `export const COFRE_HTML = ${JSON.stringify(cofre)};\n`
);
console.log("paginas.ts gerado");
