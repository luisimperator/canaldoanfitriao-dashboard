"use client";

import { useSyncExternalStore } from "react";

// Alterna claro/escuro aplicando a classe "dark" no <html>. A escolha fica em
// localStorage ("theme"); sem escolha, vale o prefers-color-scheme do aparelho
// (aplicado antes da hidratação por um script inline no layout, sem flash).
function assinarTema(aviso: () => void) {
  const obs = new MutationObserver(aviso);
  obs.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
  return () => obs.disconnect();
}

export function ThemeToggle({ className = "" }: { className?: string }) {
  // Lê a classe do <html> direto (e acompanha mudanças); no servidor, null.
  const dark = useSyncExternalStore<boolean | null>(
    assinarTema,
    () => document.documentElement.classList.contains("dark"),
    () => null,
  );

  function toggle() {
    const next = !document.documentElement.classList.contains("dark");
    document.documentElement.classList.toggle("dark", next);
    try {
      localStorage.setItem("theme", next ? "dark" : "light");
    } catch {
      /* modo anônimo etc. */
    }
  }

  return (
    <button
      onClick={toggle}
      aria-label="Alternar tema claro/escuro"
      title="Tema claro/escuro"
      className={`rounded-full px-2 py-1.5 text-base leading-none hover:bg-[var(--nav-hover)] ${className}`}
    >
      {dark === null ? "◐" : dark ? "☀️" : "🌙"}
    </button>
  );
}
