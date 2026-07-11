"use client";

import { useEffect, useState } from "react";

// Evento beforeinstallprompt (Chromium) — não tipado no DOM padrão.
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

// Botão "Instalar app": no Android/Chrome dispara o prompt nativo; no iPhone
// (Safari não tem o prompt) mostra a dica do "Compartilhar → Adicionar à Tela
// de Início". Some se o app já estiver instalado (standalone).
export function InstallButton() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [iosHint, setIosHint] = useState(false);
  const [installed, setInstalled] = useState(false);
  const [showTip, setShowTip] = useState(false);

  useEffect(() => {
    const nav = navigator as Navigator & { standalone?: boolean };
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches || nav.standalone === true;
    if (standalone) {
      setInstalled(true);
      return;
    }
    if (/ipad|iphone|ipod/i.test(navigator.userAgent)) setIosHint(true);

    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => setInstalled(true);
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (installed) return null;
  if (!deferred && !iosHint) return null;

  return (
    <div className="mb-2">
      <button
        onClick={async () => {
          if (deferred) {
            await deferred.prompt();
            setDeferred(null);
          } else {
            setShowTip((v) => !v);
          }
        }}
        className="flex w-full items-center justify-center gap-1.5 rounded-md bg-rose-600 px-3 py-2 text-xs font-semibold text-white hover:bg-rose-500"
      >
        📲 Instalar app
      </button>
      {showTip && iosHint && (
        <p className="mt-2 text-[11px] leading-snug text-slate-400 dark:text-zinc-500">
          No iPhone: toque em <strong>Compartilhar</strong> (o quadrado com a setinha ⬆) e depois
          em <strong>“Adicionar à Tela de Início”</strong>.
        </p>
      )}
    </div>
  );
}
