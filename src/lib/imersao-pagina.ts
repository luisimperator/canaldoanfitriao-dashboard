// Página pública curta dos links fixos da Imersão (/imersao e /vip) quando não
// há pra onde redirecionar: sala ainda fechada, intervalo entre os dias, grupo
// sem link. Atualiza sozinha a cada minuto — quem chegou cedo cai na sala assim
// que ela abre, sem precisar clicar de novo.

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export function paginaAviso(titulo: string, linhas: string[], opts: { recarregar?: boolean } = {}): Response {
  const html = `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
${opts.recarregar === false ? "" : '<meta http-equiv="refresh" content="60">'}
<meta name="robots" content="noindex">
<title>${esc(titulo)} · Imersão A5E</title>
<style>
  :root { --bg:#f6f5f2; --card:#fff; --ink:#18181b; --ink2:#52525b; --line:#e4e4e7; --acc:#e11d48; }
  @media (prefers-color-scheme: dark) { :root { --bg:#0b0b0d; --card:#151518; --ink:#f4f4f5; --ink2:#a1a1aa; --line:#27272a; --acc:#fb7185; } }
  * { box-sizing:border-box; }
  body { margin:0; min-height:100vh; display:grid; place-items:center; padding:16px;
         background:var(--bg); color:var(--ink); font:16px/1.55 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif; }
  main { width:100%; max-width:460px; background:var(--card); border:1px solid var(--line); border-radius:22px; padding:28px 24px; }
  .eyebrow { font:600 11px/1 ui-monospace,monospace; letter-spacing:.2em; text-transform:uppercase; color:var(--acc); margin-bottom:12px; }
  h1 { margin:0 0 12px; font-size:24px; line-height:1.2; letter-spacing:-.01em; }
  p { margin:8px 0 0; color:var(--ink2); }
</style>
</head>
<body>
<main>
  <div class="eyebrow">Imersão A5E</div>
  <h1>${esc(titulo)}</h1>
  ${linhas.map((l) => `<p>${esc(l)}</p>`).join("\n  ")}
</main>
</body>
</html>`;
  return new Response(html, {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
  });
}

/** "sábado, 21/11" no horário de São Paulo. */
export function diaHumano(iso: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    weekday: "long",
    day: "2-digit",
    month: "2-digit",
  }).format(new Date(iso));
}

/** "8h30" no horário de São Paulo. */
export function horaHumana(iso: string | number): string {
  const p = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(iso));
  const h = String(Number(p.find((x) => x.type === "hour")?.value ?? 0));
  const m = p.find((x) => x.type === "minute")?.value ?? "00";
  return m === "00" ? `${h}h` : `${h}h${m}`;
}
