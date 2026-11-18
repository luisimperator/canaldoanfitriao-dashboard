"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

// Sino: ativa/desativa os avisos neste aparelho. Dois canais:
// - "vendas": sino no menu do painel (app de ícone rosa);
// - "calls": app Agenda (/calls/agenda, ícone azul), só call agendada.
// No iPhone o aviso só funciona com o app instalado na tela de início
// (limite do iOS), então ali o botão manda instalar primeiro. Cada app da tela
// de início tem a sua assinatura; o canal dela fica guardado no aparelho
// (localStorage, que no iPhone é separado por app) pra o sino de venda não
// aparecer dentro do Agenda.

type Canal = "vendas" | "calls";
const CHAVE_CANAL = "push-canal";

function canalSalvo(): Canal | null {
  try {
    const v = localStorage.getItem(CHAVE_CANAL);
    return v === "vendas" || v === "calls" ? v : null;
  } catch {
    return null;
  }
}

function salvarCanal(c: Canal | null) {
  try {
    if (c) localStorage.setItem(CHAVE_CANAL, c);
    else localStorage.removeItem(CHAVE_CANAL);
  } catch {}
}

const TEXTOS: Record<Canal, { ligar: string; ligado: string; instalar: string; bloqueado: string; outro: string }> = {
  vendas: {
    ligar: "🔔 Ativar avisos de venda",
    ligado: "🔔 Avisos de venda ligados · desligar",
    instalar: "🔔 Pra receber avisos de venda no iPhone, instale o app na tela de início e abra por lá.",
    bloqueado: "🔔 Avisos bloqueados neste navegador. Libere as notificações do site nas configurações e recarregue.",
    outro: "🔔 Este app recebe os avisos de call (app Agenda).",
  },
  calls: {
    ligar: "📞 Ativar avisos de call",
    ligado: "📞 Avisos de call ligados · desligar",
    instalar: "📞 Primeiro instale este app na tela de início (passo a passo abaixo) e abra por lá.",
    bloqueado: "📞 Avisos bloqueados. Libere as notificações do app Agenda em Ajustes › Notificações e abra de novo.",
    outro: "📞 Este é o app do painel (ícone rosa), que recebe os avisos de venda. Os de call chegam no app Agenda, de ícone azul: instale pelo passo a passo abaixo.",
  },
};

type Estado = "carregando" | "sem_suporte" | "instalar_ios" | "bloqueado" | "desligado" | "ligado" | "outro_app";

function chaveParaBytes(base64: string): Uint8Array<ArrayBuffer> {
  const pad = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

export function PushVendasButton() {
  const pathname = usePathname();
  // Na página do Agenda o sino é o de call (e dentro do app Agenda o de venda
  // some sozinho: a assinatura de lá é de call, estado "outro_app").
  if (pathname.startsWith("/calls/agenda")) return null;
  return <PushButton canal="vendas" />;
}

export function PushButton({ canal, grande = false }: { canal: Canal; grande?: boolean }) {
  const t = TEXTOS[canal];
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
      // Assinatura sem canal guardado é do sino de venda (anterior ao Agenda).
      if (sub && (canalSalvo() ?? "vendas") !== canal) setEstado("outro_app");
      else setEstado(sub ? "ligado" : "desligado");
    })().catch(() => setEstado("sem_suporte"));
  }, [canal]);

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
        body: JSON.stringify({ ...sub.toJSON(), canal }),
      });
      if (!s.ok) throw new Error((await s.json()).error ?? "Falhou.");
      salvarCanal(canal);
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
      salvarCanal(null);
      setEstado("desligado");
    } finally {
      setOcupado(false);
    }
  }

  if (estado === "carregando" || estado === "sem_suporte") return null;
  if (estado === "outro_app" && canal === "vendas") return null;

  const base = `flex w-full items-center justify-center gap-1.5 rounded-md font-semibold ${
    grande ? "px-4 py-3 text-sm" : "px-3 py-2 text-xs"
  }`;
  const cor = canal === "calls" ? "bg-blue-700 hover:bg-blue-600" : "bg-emerald-600 hover:bg-emerald-500";
  return (
    <div className="mb-2">
      {estado === "ligado" ? (
        <button onClick={desligar} disabled={ocupado} className={`${base} border border-slate-700 text-slate-300 hover:bg-slate-800 disabled:opacity-50`}>
          {ocupado ? "…" : t.ligado}
        </button>
      ) : estado === "desligado" ? (
        <button onClick={ligar} disabled={ocupado} className={`${base} ${cor} text-white disabled:opacity-50`}>
          {ocupado ? "…" : t.ligar}
        </button>
      ) : (
        <p className={`${grande ? "text-sm" : "text-[11px]"} leading-snug text-slate-400`}>
          {estado === "instalar_ios" ? t.instalar : estado === "outro_app" ? t.outro : t.bloqueado}
        </p>
      )}
      {erro && <p className="mt-1 text-[11px] text-rose-400">{erro}</p>}
    </div>
  );
}
