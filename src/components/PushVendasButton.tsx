"use client";

import { useEffect, useState } from "react";

// Sino no menu: ativa/desativa o aviso de venda nova neste aparelho.
// No iPhone o aviso só funciona com o app instalado na tela de início
// (limite do iOS), então ali o botão manda instalar primeiro.

type Estado = "carregando" | "sem_suporte" | "instalar_ios" | "bloqueado" | "desligado" | "ligado";

function chaveParaBytes(base64: string): Uint8Array<ArrayBuffer> {
  const pad = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

export function PushVendasButton() {
  const [estado, setEstado] = useState<Estado>("carregando");
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const nav = navigator as Navigator & { standalone?: boolean };
      const ios = /ipad|iphone|ipod/i.test(navigator.userAgent);
      const instalado =
        window.matchMedia("(display-mode: standalone)").matches || nav.standalone === true;
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
        setEstado(ios && !instalado ? "instalar_ios" : "sem_suporte");
        return;
      }
      if (Notification.permission === "denied") {
        setEstado("bloqueado");
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      setEstado(sub ? "ligado" : "desligado");
    })().catch(() => setEstado("sem_suporte"));
  }, []);

  async function ligar() {
    setOcupado(true);
    setErro(null);
    try {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") {
        setEstado(perm === "denied" ? "bloqueado" : "desligado");
        return;
      }
      const r = await fetch("/api/push");
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? "Falhou.");
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: chaveParaBytes(j.publicKey),
      });
      const s = await fetch("/api/push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sub.toJSON()),
      });
      if (!s.ok) throw new Error((await s.json()).error ?? "Falhou.");
      setEstado("ligado");
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falhou.");
    } finally {
      setOcupado(false);
    }
  }

  async function desligar() {
    setOcupado(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await fetch("/api/push", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        });
        await sub.unsubscribe();
      }
      setEstado("desligado");
    } finally {
      setOcupado(false);
    }
  }

  if (estado === "carregando" || estado === "sem_suporte") return null;

  const base = "flex w-full items-center justify-center gap-1.5 rounded-md px-3 py-2 text-xs font-semibold";
  return (
    <div className="mb-2">
      {estado === "ligado" ? (
        <button onClick={desligar} disabled={ocupado} className={`${base} border border-slate-700 text-slate-300 hover:bg-slate-800 disabled:opacity-50`}>
          {ocupado ? "…" : "🔔 Avisos de venda ligados · desligar"}
        </button>
      ) : estado === "desligado" ? (
        <button onClick={ligar} disabled={ocupado} className={`${base} bg-emerald-600 text-white hover:bg-emerald-500 disabled:opacity-50`}>
          {ocupado ? "…" : "🔔 Ativar avisos de venda"}
        </button>
      ) : (
        <p className="text-[11px] leading-snug text-slate-400">
          {estado === "instalar_ios"
            ? "🔔 Pra receber avisos de venda no iPhone, instale o app na tela de início e abra por lá."
            : "🔔 Avisos bloqueados neste navegador. Libere as notificações do site nas configurações e recarregue."}
        </p>
      )}
      {erro && <p className="mt-1 text-[11px] text-rose-400">{erro}</p>}
    </div>
  );
}
