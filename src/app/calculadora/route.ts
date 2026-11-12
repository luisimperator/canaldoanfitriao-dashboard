import { CALCULADORA_HTML } from "@/lib/roteiros/paginas";

// Calculadora de Ganhos no seu imóvel, pra mostrar em tela cheia na call e na
// visita técnica. Pública (fora do login do painel e sem senha): não tem dado
// nenhum, só faz a conta com os números digitados, e o vendedor pode mandar o
// link da simulação pro lead depois. Conteúdo em src/lib/roteiros/calculadora.html
// (rode node scripts/gerar-roteiros.mjs depois de editar).
export function GET() {
  return new Response(CALCULADORA_HTML, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "public, max-age=300",
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
}
