"use client";

import { useState } from "react";
import { createBrowserClient } from "@supabase/ssr";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!supabaseUrl || !supabaseKey) return;
    setLoading(true);
    setError(null);
    const supabase = createBrowserClient(supabaseUrl, supabaseKey);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setError("E-mail ou senha incorretos.");
      setLoading(false);
      return;
    }
    window.location.href = "/";
  }

  return (
    <div className="fixed inset-0 z-30 flex min-h-screen items-center justify-center bg-slate-900 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <div className="text-xl font-bold text-white">Canal do Anfitrião</div>
          <div className="text-xs font-medium text-rose-400 mt-0.5">dashboard</div>
        </div>
        <form
          onSubmit={handleSubmit}
          className="rounded-xl bg-[#0f1720] p-6 shadow-lg space-y-4"
        >
          {!supabaseUrl ? (
            <p className="text-sm text-slate-300">
              Modo demonstração: login desativado.
            </p>
          ) : (
            <>
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  E-mail
                </label>
                <input
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-50 focus:border-rose-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Senha
                </label>
                <input
                  type="password"
                  required
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-50 focus:border-rose-500 focus:outline-none"
                />
              </div>
              {error && <p className="text-xs text-rose-600">{error}</p>}
              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-lg bg-rose-600 py-2 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-60"
              >
                {loading ? "Entrando..." : "Entrar"}
              </button>
            </>
          )}
        </form>
      </div>
    </div>
  );
}
