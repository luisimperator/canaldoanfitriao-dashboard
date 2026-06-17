"use client";

import { useEffect, useState } from "react";
import { createBrowserClient } from "@supabase/ssr";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export default function AtualizarSenhaPage() {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);

  // Ao abrir pelo link do e-mail, o supabase-js detecta o token na URL e
  // estabelece a sessão de recuperação. Esperamos esse evento antes de liberar.
  useEffect(() => {
    if (!supabaseUrl || !supabaseKey) return;
    const supabase = createBrowserClient(supabaseUrl, supabaseKey);
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setReady(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") setReady(true);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!supabaseUrl || !supabaseKey) return;
    setError(null);
    if (password.length < 4) {
      setError("A senha precisa ter ao menos 4 caracteres.");
      return;
    }
    if (password !== confirm) {
      setError("As senhas não coincidem.");
      return;
    }
    setLoading(true);
    const supabase = createBrowserClient(supabaseUrl, supabaseKey);
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (error) {
      setError("Não foi possível redefinir. O link pode ter expirado — peça um novo.");
      return;
    }
    setDone(true);
    setTimeout(() => (window.location.href = "/"), 1500);
  }

  return (
    <div className="fixed inset-0 z-30 flex min-h-screen items-center justify-center bg-slate-900 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <div className="text-xl font-bold text-white">Canal do Anfitrião</div>
          <div className="text-xs font-medium text-rose-400 mt-0.5">redefinir senha</div>
        </div>
        <form onSubmit={handleSubmit} className="rounded-xl bg-white p-6 shadow-lg space-y-4">
          {done ? (
            <p className="text-sm text-emerald-600">Senha redefinida! Redirecionando…</p>
          ) : !ready ? (
            <p className="text-sm text-slate-600">
              Abra esta página pelo link enviado ao seu e-mail. Validando o link…
            </p>
          ) : (
            <>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Nova senha</label>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-rose-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Confirmar senha</label>
                <input
                  type="password"
                  required
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-rose-500 focus:outline-none"
                />
              </div>
              {error && <p className="text-xs text-rose-600">{error}</p>}
              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-lg bg-rose-600 py-2 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-60"
              >
                {loading ? "Salvando..." : "Redefinir senha"}
              </button>
            </>
          )}
        </form>
      </div>
    </div>
  );
}
