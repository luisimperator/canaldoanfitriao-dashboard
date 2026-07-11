"use client";

import { useEffect, useState } from "react";

// Alterna claro/escuro aplicando a classe "dark" no <html>. A escolha fica em
// localStorage ("theme"); sem escolha, vale o prefers-color-scheme do aparelho
// (aplicado antes da hidratação por um script inline no layout, sem flash).
export function ThemeToggle({ className = "" }: { className?: string }) {
  const [dark, setDark] = useState<boolean | null>(null);

  useEffect(() => {
    setDark(document.documentElement.classList.contains("dark"));
  }, []);

  function toggle() {
    const next = !document.documentElement.classList.contains("dark");
    document.documentElement.classList.toggle("dark", next);
    try {
      localStorage.setItem("theme", next ? "dark" : "light");
    } catch {
      /* modo anônimo etc. */
    }
    setDark(next);
  }

  return (
    <button
      onClick={toggle}
      aria-label="Alternar tema claro/escuro"
      title="Tema claro/escuro"
      className={`rounded-md px-2 py-1.5 text-base leading-none text-slate-400 hover:bg-slate-800 hover:text-white ${className}`}
    >
      {dark === null ? "◐" : dark ? "☀️" : "🌙"}
    </button>
  );
}
