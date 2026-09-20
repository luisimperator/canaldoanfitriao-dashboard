import { createHash, timingSafeEqual } from "crypto";
import type { NextRequest } from "next/server";

// Comparação de segredos em tempo constante.
//
// `a === b` em string retorna no primeiro byte diferente, o que deixa vazar,
// por tempo de resposta, quantos caracteres do segredo o atacante já acertou.
// Aqui os dois lados passam por SHA-256 antes do timingSafeEqual: o hash
// iguala os tamanhos (timingSafeEqual exige buffers do mesmo comprimento) e
// não revela o comprimento do segredo.
//
// Vazio/ausente de qualquer lado é sempre falso — segredo não configurado no
// servidor nunca pode "bater" com uma requisição sem chave.
export function safeEqual(
  a: string | null | undefined,
  b: string | null | undefined
): boolean {
  if (typeof a !== "string" || typeof b !== "string" || a.length === 0 || b.length === 0) {
    return false;
  }
  const ha = createHash("sha256").update(a, "utf8").digest();
  const hb = createHash("sha256").update(b, "utf8").digest();
  return timingSafeEqual(ha, hb);
}

/** Token do header `Authorization: Bearer <token>`, ou null se não vier nesse formato. */
export function bearerToken(req: Pick<NextRequest, "headers">): string | null {
  const auth = req.headers.get("authorization") ?? "";
  const m = /^Bearer\s+(.+)$/i.exec(auth.trim());
  return m ? m[1].trim() : null;
}

/** A requisição traz o bearer igual ao `expected`? (falso se `expected` não estiver configurado). */
export function hasValidBearer(
  req: Pick<NextRequest, "headers">,
  expected: string | null | undefined
): boolean {
  return safeEqual(bearerToken(req), expected);
}

// Requisição do cron da Vercel (vercel.json): ela manda
// `Authorization: Bearer <CRON_SECRET>`. Sem CRON_SECRET no ambiente, nunca
// é cron — o porteiro (src/proxy.ts) já devolve 503 nesse caso.
export function isCronRequest(req: Pick<NextRequest, "headers">): boolean {
  return hasValidBearer(req, process.env.CRON_SECRET);
}

// Chave de webhook/import: header `x-webhook-key` OU query `?key=`. O header é
// o caminho preferido (não vai parar em log de acesso nem em histórico de
// navegador); a query continua aceita porque os painéis externos (Unnichat,
// Eduzz, TMB, crons do Supabase) já estão cadastrados com ela.
export function webhookKey(req: Pick<NextRequest, "headers" | "nextUrl">): string | null {
  const header = req.headers.get("x-webhook-key");
  if (header && header.trim()) return header.trim();
  const query = req.nextUrl.searchParams.get("key");
  return query && query.trim() ? query.trim() : null;
}

/** A requisição traz a chave (header ou query) igual à esperada? */
export function hasValidWebhookKey(
  req: Pick<NextRequest, "headers" | "nextUrl">,
  expected: string | null | undefined
): boolean {
  return safeEqual(webhookKey(req), expected);
}
