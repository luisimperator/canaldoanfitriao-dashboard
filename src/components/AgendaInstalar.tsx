"use client";

import { useEffect, useState } from "react";

// Passo a passo pra instalar o app Agenda (ícone azul). Some quando a página
// já está aberta como app (standalone).
export function AgendaInstalar() {
  const [mostrar, setMostrar] = useState(false);
  useEffect(() => {
    (async () => {
      const nav = navigator as Navigator & { standalone?: boolean };
      const app = window.matchMedia("(display-mode: standalone)").matches || nav.standalone === true;
      if (!app) return setMostrar(true);
      // Aberto como app: se este aparelho já tem o aviso de venda, é o app do
      // painel (rosa) e o Agenda ainda é outro app a instalar.
      let canal: string | null = null;
      try {
        canal = localStorage.getItem("push-canal");
      } catch {}
      const reg = "serviceWorker" in navigator ? await navigator.serviceWorker.ready : null;
      const sub = reg && "pushManager" in reg ? await reg.pushManager.getSubscription() : null;
      setMostrar(Boolean(sub) && canal !== "calls");
    })().catch(() => setMostrar(false));
  }, []);
  if (!mostrar) return null;
  return (
    <div className="mb-4 rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-slate-700 dark:border-blue-400/30 dark:bg-blue-500/10 dark:text-zinc-200">
      <div className="mb-2 flex items-center gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/icon-agenda-192.png" alt="" width={40} height={40} className="rounded-[10px]" />
        <p className="font-semibold">Instale o app Agenda (ícone azul) pra receber só as calls</p>
      </div>
      <ol className="list-decimal space-y-1 pl-5">
        <li>Abra esta página no Safari do iPhone (não no app rosa).</li>
        <li>
          Toque em <b>Compartilhar</b> (quadrado com a seta pra cima) e depois em <b>Adicionar à Tela de Início</b>.
        </li>
        <li>
          O nome já vem <b>Agenda</b>, com o ícone azul. Toque em <b>Adicionar</b>.
        </li>
        <li>Abra o app Agenda, entre com seu e-mail e senha e toque em <b>Ativar avisos de call</b>.</li>
      </ol>
      <p className="mt-2 text-xs text-slate-500 dark:text-zinc-400">
        Com o Agenda ligado, as calls param de chegar no app rosa, que fica só com as vendas.
      </p>
    </div>
  );
}
