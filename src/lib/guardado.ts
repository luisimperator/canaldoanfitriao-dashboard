// Escolhas de tela guardadas neste navegador (localStorage), lidas com
// useSyncExternalStore: no servidor e na hidratação vale o padrão; depois, o
// que estiver salvo. Sem localStorage (aba anônima, bloqueio), fica em memória
// enquanto a página estiver aberta.

import { useSyncExternalStore } from "react";

const memoria = new Map<string, string>();
const ouvintes = new Set<() => void>();

function ler(chave: string): string | null {
  try {
    const v = localStorage.getItem(chave);
    if (v !== null) return v;
  } catch {
    // sem localStorage
  }
  return memoria.get(chave) ?? null;
}

function assinar(cb: () => void): () => void {
  ouvintes.add(cb);
  window.addEventListener("storage", cb);
  return () => {
    ouvintes.delete(cb);
    window.removeEventListener("storage", cb);
  };
}

export function gravar(chave: string, valor: string): void {
  memoria.set(chave, valor);
  try {
    localStorage.setItem(chave, valor);
  } catch {
    // sem localStorage: fica só em memória
  }
  for (const f of ouvintes) f();
}

/** Valor salvo (string) ou null; no servidor, sempre null. */
export function useGuardado(chave: string): string | null {
  return useSyncExternalStore(
    assinar,
    () => ler(chave),
    () => null
  );
}
