"use client";

import { useState } from "react";

// Testa a cadeia de redirects de um link e mostra onde o rastreio morre.
//
// O /r/<slug> carimba os UTMs corretamente — mas basta a LP redirecionar uma
// vez (www, /pt-br, A/B, encurtador da plataforma) para os parâmetros caírem, e
// o lead entra sem origem. Salto a salto, dá pra ver exatamente em qual hop
// sumiram.

interface Salto {
  url: string;
  status: number | null;
  params: string[];
  perdidos: string[];
  erro?: string;
}

interface Resultado {
  saltos: Salto[];
  url_final: string | null;
  params_sobreviveram: string[];
  params_perdidos: string[];
  rastreio_ok: boolean;
  error?: string;
}

export function TestarCadeia({ slug }: { slug: string }) {
  const [aberto, setAberto] = useState(false);
  const [carregando, setCarregando] = useState(false);
  const [r, setR] = useState<Resultado | null>(null);

  async function testar() {
    setAberto(true);
    setCarregando(true);
    setR(null);
    try {
      const res = await fetch(`/api/links/trace?slug=${encodeURIComponent(slug)}`);
      setR(await res.json());
    } catch {
      setR({
        saltos: [],
        url_final: null,
        params_sobreviveram: [],
        params_perdidos: [],
        rastreio_ok: false,
        error: "Falha de rede",
      });
    } finally {
      setCarregando(false);
    }
  }

  if (!aberto) {
    return (
      <button
        onClick={testar}
        title="Seguir a cadeia de redirects e ver se o rastreio sobrevive"
        className="shrink-0 rounded-md border border-slate-200 dark:border-white/10 px-2 py-1 text-xs text-slate-600 dark:text-zinc-400 hover:bg-slate-50 dark:hover:bg-white/[0.06]"
      >
        Testar rastreio
      </button>
    );
  }

  return (
    <div className="mt-3 w-full rounded-lg border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/[0.03] p-4">
      {carregando && (
        <p className="text-xs text-slate-500 dark:text-zinc-400">Seguindo os redirects…</p>
      )}

      {r?.error && <p className="text-xs text-rose-600 dark:text-rose-400">{r.error}</p>}

      {r && !r.error && (
        <>
          <p
            className={`mb-3 rounded-lg px-3 py-2 text-xs ${
              r.rastreio_ok
                ? "bg-emerald-50 dark:bg-emerald-500/10 text-emerald-800 dark:text-emerald-300"
                : "bg-rose-50 dark:bg-rose-500/10 text-rose-700 dark:text-rose-300"
            }`}
          >
            {r.rastreio_ok
              ? "✓ O rastreio chega inteiro na LP. O lead vai entrar com origem."
              : "✗ O rastreio morre no caminho — o lead vai entrar SEM origem. Veja em qual salto abaixo."}
          </p>

          <ol className="space-y-2">
            {r.saltos.map((s, i) => (
              <li key={i} className="text-xs">
                <div className="flex items-start gap-2">
                  <span className="mt-0.5 shrink-0 rounded bg-slate-200 dark:bg-white/10 px-1.5 py-0.5 font-mono text-[10px] text-slate-600 dark:text-zinc-400">
                    {i + 1}
                  </span>
                  <div className="min-w-0">
                    <code className="block break-all text-slate-700 dark:text-zinc-300">{s.url}</code>
                    <div className="mt-0.5 flex flex-wrap items-center gap-2">
                      <span className="text-slate-400 dark:text-zinc-500">
                        {s.erro ? `erro: ${s.erro}` : `HTTP ${s.status}`}
                      </span>
                      <span className="text-slate-400 dark:text-zinc-500">
                        {s.params.length} de 5 parâmetros
                      </span>
                      {s.perdidos.length > 0 && (
                        <span className="rounded bg-rose-100 dark:bg-rose-500/15 px-1.5 py-0.5 text-rose-700 dark:text-rose-300">
                          perdeu: {s.perdidos.join(", ")}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </li>
            ))}
          </ol>

          {r.params_perdidos.length > 0 && (
            <p className="mt-3 text-[11px] text-slate-500 dark:text-zinc-400">
              Não chegaram na LP: <strong>{r.params_perdidos.join(", ")}</strong>
            </p>
          )}

          <p className="mt-2 text-[11px] text-slate-400 dark:text-zinc-500">
            Isso testa até a LP. O último elo — a LP gravar os parâmetros no formulário — só o
            teste real confirma: preencha a lista pelo link e veja se o lead aparece aqui.
          </p>

          <button
            onClick={() => setAberto(false)}
            className="mt-3 rounded-md border border-slate-300 dark:border-white/15 px-3 py-1 text-xs text-slate-600 dark:text-zinc-400"
          >
            Fechar
          </button>
        </>
      )}
    </div>
  );
}
