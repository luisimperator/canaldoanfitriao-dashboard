"use client";

import { useEffect } from "react";

// Visualizador de imagem em tela cheia.
//
// Print de tela é o anexo mais comum do suporte, e no balão a miniatura fica
// com 256px de altura — ilegível justamente onde está a informação (mensagem de
// erro, número do pedido, valor da cobrança). Sem isso a única saída era abrir o
// DevTools e copiar a URL assinada.
export function Lightbox({ src, onFechar }: { src: string; onFechar: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onFechar();
    };
    document.addEventListener("keydown", onKey);
    // Trava o scroll do fundo enquanto a imagem está aberta.
    const overflowAnterior = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflowAnterior;
    };
  }, [onFechar]);

  return (
    <div
      onClick={onFechar}
      role="dialog"
      aria-modal="true"
      aria-label="Imagem em tela cheia"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
    >
      <div className="absolute right-4 top-4 flex gap-2">
        <a
          href={src}
          target="_blank"
          rel="noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="rounded-lg bg-white/10 px-3 py-1.5 text-sm text-white hover:bg-white/20"
        >
          Abrir original
        </a>
        <button
          onClick={onFechar}
          aria-label="Fechar"
          className="rounded-lg bg-white/10 px-3 py-1.5 text-sm text-white hover:bg-white/20"
        >
          Fechar ✕
        </button>
      </div>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt="anexo em tela cheia"
        onClick={(e) => e.stopPropagation()}
        className="max-h-full max-w-full rounded-lg object-contain"
      />
    </div>
  );
}
