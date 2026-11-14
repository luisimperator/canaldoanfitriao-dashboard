"use client";

import { useState } from "react";

// Recarrega a página inteira. No app instalado (tela cheia) não existe o botão
// de recarregar do navegador nem o "puxar pra atualizar", e várias abas buscam
// os dados no cliente, então o reload completo é o que garante número fresco.
export function RefreshButton({ className = "" }: { className?: string }) {
  const [girando, setGirando] = useState(false);

  return (
    <button
      onClick={() => {
        setGirando(true);
        window.location.reload();
      }}
      disabled={girando}
      aria-label="Atualizar a página"
      title="Atualizar"
      className={`rounded-full p-1.5 hover:bg-[var(--nav-hover)] disabled:opacity-60 ${className}`}
    >
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={girando ? "animate-spin" : ""}
      >
        <path d="M21 12a9 9 0 1 1-2.64-6.36" />
        <path d="M21 3v6h-6" />
      </svg>
    </button>
  );
}
