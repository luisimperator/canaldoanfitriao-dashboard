import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";

// Porta das páginas do time comercial (/roteiro-sales-call-atual,
// /roteiro-sales-call-nova e /cofre): ficam fora do login do painel e pedem só uma
// senha, guardada na variável ROTEIRO_SENHA da Vercel. Quem acerta ganha um
// cookie de 30 dias que abre todas elas. Trocar a senha na Vercel
// invalida os cookies antigos (o cookie é derivado da senha).

const COOKIE = "roteiro_acesso";
const TRINTA_DIAS = 60 * 60 * 24 * 30;

function senhaConfigurada(): string | null {
  const s = process.env.ROTEIRO_SENHA?.trim();
  return s ? s : null;
}

function marca(senha: string): string {
  return createHash("sha256").update(`roteiro-sales-call:${senha}`).digest("hex");
}

function iguais(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

function html(corpo: string, status = 200): Response {
  return new Response(corpo, {
    status,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "private, no-store",
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function telaDeSenha(titulo: string, caminho: string, aviso: string | null): string {
  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="robots" content="noindex, nofollow">
<title>${esc(titulo)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Inter:wght@400;500;600&display=swap">
<style>
:root { color-scheme: dark; --bg: #0a0a0a; --fg: #f6f6f6; --muted: rgba(246,246,246,.66); --line: rgba(255,255,255,.12); --teal: #2dd4bf; --teal-ink: #052e2a; --red: #ff2e5f; }
* { box-sizing: border-box; }
html, body { height: 100%; }
body { margin: 0; background: radial-gradient(700px 420px at 85% 0%, rgba(45,212,191,.14), transparent 60%), var(--bg); color: var(--fg); font-family: "Inter", system-ui, -apple-system, "Segoe UI", sans-serif; display: grid; place-items: center; padding-inline: max(16px, env(safe-area-inset-left, 0px)) max(16px, env(safe-area-inset-right, 0px)); }
form { width: 100%; max-width: 360px; display: grid; gap: 14px; padding: 28px; border: 1px solid var(--line); border-radius: 18px; background: rgba(255,255,255,.04); }
.marca { font-family: "Bebas Neue", "Arial Narrow", Impact, sans-serif; letter-spacing: .18em; font-size: 15px; color: var(--muted); }
h1 { margin: 0; font-family: "Bebas Neue", "Arial Narrow", Impact, sans-serif; font-weight: 400; font-size: 40px; line-height: .95; letter-spacing: .02em; }
label { font-size: 13px; color: var(--muted); }
input { width: 100%; font: inherit; font-size: 18px; padding: 12px 14px; border-radius: 12px; border: 1px solid var(--line); background: rgba(0,0,0,.35); color: var(--fg); }
input:focus { outline: 2px solid var(--teal); outline-offset: 1px; }
button { font-family: "Bebas Neue", "Arial Narrow", Impact, sans-serif; letter-spacing: .14em; font-size: 19px; padding: 12px; border: 0; border-radius: 999px; background: var(--teal); color: var(--teal-ink); cursor: pointer; }
button:focus-visible { outline: 2px solid var(--fg); outline-offset: 3px; }
.aviso { margin: 0; font-size: 14px; color: var(--red); }
</style>
</head>
<body>
<form method="post" action="${esc(caminho)}">
  <span class="marca">CANAL DO ANFITRIÃO · TIME COMERCIAL</span>
  <h1>${esc(titulo)}</h1>
  <label for="senha">Senha</label>
  <input id="senha" name="senha" type="password" inputmode="numeric" autocomplete="current-password" autofocus required>
  ${aviso ? `<p class="aviso" role="alert">${esc(aviso)}</p>` : ""}
  <button type="submit">Entrar</button>
</form>
</body>
</html>`;
}

/** GET: mostra a página se o cookie bate com a senha; senão, a tela de senha. */
export function mostrar(request: NextRequest, titulo: string, caminho: string, conteudo: string): Response {
  const senha = senhaConfigurada();
  if (!senha) return html(telaDeSenha(titulo, caminho, "A senha desta página ainda não foi configurada."), 503);
  const cookie = request.cookies.get(COOKIE)?.value ?? "";
  if (cookie && iguais(cookie, marca(senha))) return html(conteudo);
  const errou = request.nextUrl.searchParams.has("erro");
  // 200 (e não 401): é uma tela de login comum, e 401 sem WWW-Authenticate
  // confunde verificadores e prévias de link.
  return html(telaDeSenha(titulo, caminho, errou ? "Senha errada. Tente de novo." : null));
}

/** A pessoa já passou pela senha (cookie válido)? Usado pelas rotas de dados das páginas da porta (ex.: chat do Cofre de Cases). */
export function liberado(request: NextRequest): boolean {
  const senha = senhaConfigurada();
  if (!senha) return false;
  const cookie = request.cookies.get(COOKIE)?.value ?? "";
  return Boolean(cookie) && iguais(cookie, marca(senha));
}

/** POST: confere a senha do formulário, grava o cookie e volta pra página. */
export async function entrar(request: NextRequest, caminho: string): Promise<Response> {
  const senha = senhaConfigurada();
  const form = await request.formData().catch(() => null);
  const digitada = String(form?.get("senha") ?? "").trim();
  const ok = Boolean(senha) && iguais(marca(digitada), marca(senha as string));
  const destino = new URL(ok ? caminho : `${caminho}?erro=1`, request.url);
  const res = NextResponse.redirect(destino, 303);
  if (ok) {
    res.cookies.set(COOKIE, marca(senha as string), {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: TRINTA_DIAS,
    });
  }
  return res;
}
