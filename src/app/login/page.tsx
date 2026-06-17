"use client";

import { useState } from "react";
import { createBrowserClient } from "@supabase/ssr";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [forgot, setForgot] = useState(false);

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

  async function handleReset(e: React.FormEvent) {
    e.preventDefault();
    if (!supabaseUrl || !supabaseKey) return;
    setLoading(true);
    setError(null);
    setInfo(null);
    const supabase = createBrowserClient(supabaseUrl, supabaseKey);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/atualizar-senha`,
    });
    setLoading(false);
    if (error) {
      setError("Não foi possível enviar o e-mail.");
      return;
    }
    setInfo("Se este e-mail tiver conta, enviamos um link para redefinir a senha.");
  }

  return (
    <div className="fixed inset-0 z-30 flex min-h-screen items-center justify-center bg-slate-900 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <div className="text-xl font-bold text-white">Canal do Anfitrião</div>
          <div className="text-xs font-medium text-rose-400 mt-0.5">dashboard</div>
        </div>
        <form
          onSubmit={forgot ? handleReset : handleSubmit}
          className="rounded-xl bg-white p-6 shadow-lg space-y-4"
        >
          {!supabaseUrl ? (
            <p className="text-sm text-slate-600">
              Modo demonstração: login desativado.
            </p>
          ) : (
            <>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  E-mail
                </label>
                <input
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-rose-500 focus:outline-none"
                />
              </div>
              {!forgot && (
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">
                    Senha
                  </label>
                  <input
                    type="password"
                    required
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-rose-500 focus:outline-none"
                  />
                </div>
              )}
              {error && <p className="text-xs text-rose-600">{error}</p>}
              {info && <p className="text-xs text-emerald-600">{info}</p>}
              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-lg bg-rose-600 py-2 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-60"
              >
                {loading
                  ? forgot
                    ? "Enviando..."
                    : "Entrando..."
                  : forgot
                    ? "Enviar link de redefinição"
                    : "Entrar"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setForgot((f) => !f);
                  setError(null);
                  setInfo(null);
                }}
                className="w-full text-center text-xs text-slate-500 hover:text-slate-700"
              >
                {forgot ? "← Voltar ao login" : "Esqueci minha senha"}
              </button>
            </>
          )}
        </form>
      </div>
    </div>
  );
}
