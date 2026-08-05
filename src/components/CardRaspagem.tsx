"use client";

import { useCallback, useEffect, useState } from "react";

// Raspagem Asaas → Inter: status da última execução + disparo manual.
// O automático roda 3× ao dia pelo cron; este botão é pra quando o dinheiro
// precisa chegar agora (ex.: pagar boleto hoje).

interface Linha {
  criada_em: string;
  trigger: string;
  ok: boolean;
  pulou: boolean;
  motivo: string | null;
  erro: string | null;
  valor: number | null;
  saldo: number | null;
  transfer_status: string | null;
}

const brl = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function quando(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function CardRaspagem() {
  const [configurada, setConfigurada] = useState<boolean | null>(null);
  // colchão e piso EM VIGOR no servidor — env na Vercel só vale após redeploy,
  // então mostrar os números é o jeito de saber se a mudança pegou.
  const [colchao, setColchao] = useState<number | null>(null);
  const [piso, setPiso] = useState<number | null>(null);
  const [ultimas, setUltimas] = useState<Linha[]>([]);
  const [raspando, setRaspando] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    const res = await fetch("/api/financeiro/raspagem");
    if (!res.ok) return;
    const j = await res.json();
    setConfigurada(Boolean(j.configurada));
    setColchao(typeof j.colchao === "number" ? j.colchao : null);
    setPiso(typeof j.piso === "number" ? j.piso : null);
    setUltimas((j.ultimas ?? []) as Linha[]);
  }, []);

  useEffect(() => {
    const t = setTimeout(carregar, 0);
    return () => clearTimeout(t);
  }, [carregar]);

  async function raspar() {
    setRaspando(true);
    setMsg(null);
    setErro(null);
    try {
      const res = await fetch("/api/financeiro/raspagem", { method: "POST" });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErro(j.error ?? j.erro ?? `Erro ${res.status}`);
      } else if (j.transferido) {
        setMsg(`Mandei ${brl(j.transferido)} pro Inter.`);
      } else {
        setMsg(j.motivo ?? "Nada a transferir agora.");
      }
      await carregar();
    } catch {
      setErro("Falha de rede");
    } finally {
      setRaspando(false);
    }
  }

  const ultima = ultimas[0];
  const ultimaTransferencia = ultimas.find((u) => u.valor != null);

  return (
    <div className="rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#15121f] p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-slate-900 dark:text-zinc-100">
            Raspagem Asaas → Inter
          </h3>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-zinc-400">
            1× ao dia, às 19h40. Deixa{" "}
            {colchao != null ? <strong>{brl(colchao)}</strong> : "um colchão"} no Asaas e só
            transfere se a sobra passar de{" "}
            {piso != null ? <strong>{brl(piso)}</strong> : "um piso"} — a cota do Asaas é de
            30 Pix de saída grátis por mês.
          </p>
        </div>
        <button
          onClick={raspar}
          disabled={raspando || configurada === false}
          className="shrink-0 rounded-lg bg-slate-900 dark:bg-violet-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-slate-700 dark:hover:bg-violet-500 disabled:opacity-50"
        >
          {raspando ? "Raspando…" : "Raspar agora"}
        </button>
      </div>

      {configurada === false && (
        <p className="mt-3 rounded-lg bg-amber-50 dark:bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-300">
          Desligada: falta a chave Pix do Inter em <code>ASAAS_SWEEP_PIX_KEY</code> na
          Vercel. Enquanto ela não existir, o cron roda e não transfere nada.
        </p>
      )}
      {msg && <p className="mt-3 text-sm text-emerald-700 dark:text-emerald-400">{msg}</p>}
      {erro && <p className="mt-3 text-sm text-rose-600 dark:text-rose-400">{erro}</p>}

      {ultima && (
        <p className="mt-3 text-xs text-slate-500 dark:text-zinc-400">
          Última tentativa {quando(ultima.criada_em)} ({ultima.trigger}):{" "}
          {ultima.erro ? (
            <span className="text-rose-600 dark:text-rose-400">falhou — {ultima.erro}</span>
          ) : ultima.valor != null ? (
            <span className="font-medium text-slate-700 dark:text-zinc-300">
              {brl(ultima.valor)} transferidos
              {ultima.transfer_status ? ` (${ultima.transfer_status})` : ""}
            </span>
          ) : (
            (ultima.motivo ?? "sem transferência")
          )}
          {ultimaTransferencia && ultimaTransferencia !== ultima && (
            <>
              {" · último Pix de fato: "}
              {brl(ultimaTransferencia.valor!)} em {quando(ultimaTransferencia.criada_em)}
            </>
          )}
        </p>
      )}
    </div>
  );
}
