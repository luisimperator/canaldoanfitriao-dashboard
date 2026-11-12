"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// Componentes da tela Entrega TMB → Eduzz/Nutror.

async function postar(path: string, body?: unknown): Promise<{ ok: boolean; mensagem: string }> {
  try {
    const res = await fetch(path, {
      method: "POST",
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, mensagem: json.error ?? `Erro ${res.status}` };
    return { ok: true, mensagem: json.mensagem ?? "Feito" };
  } catch {
    return { ok: false, mensagem: "Falha de rede" };
  }
}

const BTN =
  "rounded-lg bg-slate-900 dark:bg-zinc-100 dark:text-zinc-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-700 dark:hover:bg-white disabled:opacity-60";
const BTN_LEVE =
  "rounded-md border border-slate-300 dark:border-white/15 px-2 py-1 text-[11px] font-semibold text-slate-700 dark:text-zinc-300 hover:bg-slate-50 dark:hover:bg-white/5 disabled:opacity-60";
const INPUT =
  "w-full rounded-md border border-slate-300 dark:border-white/15 bg-white dark:bg-white/[0.04] px-2 py-1.5 text-sm text-slate-900 dark:text-zinc-100";

function Retorno({ r }: { r: { ok: boolean; mensagem: string } | null }) {
  if (!r) return null;
  return (
    <span className={`text-xs ${r.ok ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}>
      {r.mensagem}
    </span>
  );
}

export function TmbBotao({
  path,
  body,
  label,
  confirmar,
  leve = false,
}: {
  path: string;
  body?: unknown;
  label: string;
  confirmar?: string;
  leve?: boolean;
}) {
  const router = useRouter();
  const [rodando, setRodando] = useState(false);
  const [r, setR] = useState<{ ok: boolean; mensagem: string } | null>(null);
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <button
        className={leve ? BTN_LEVE : BTN}
        disabled={rodando}
        onClick={async () => {
          if (confirmar && !window.confirm(confirmar)) return;
          setRodando(true);
          setR(null);
          const res = await postar(path, body);
          setR(res);
          setRodando(false);
          router.refresh();
        }}
      >
        {rodando ? "..." : label}
      </button>
      <Retorno r={r} />
    </span>
  );
}

export function TmbConfigForm({
  modoTeste,
  telefones,
  templateId,
  tmbProdutoId,
  filtro,
}: {
  modoTeste: boolean;
  telefones: string[];
  templateId: string | null;
  tmbProdutoId: string | null;
  filtro: string;
}) {
  const router = useRouter();
  const [tel, setTel] = useState(telefones.join(", "));
  const [tpl, setTpl] = useState(templateId ?? "");
  const [prod, setProd] = useState(tmbProdutoId ?? "");
  const [filt, setFilt] = useState(filtro);
  const [r, setR] = useState<{ ok: boolean; mensagem: string } | null>(null);
  const [salvando, setSalvando] = useState(false);

  async function salvar(extra?: Record<string, unknown>) {
    setSalvando(true);
    setR(null);
    const res = await postar(
      "/api/tmb/config",
      extra ?? { aviso_telefones: tel, aviso_template_id: tpl, tmb_produto_id: prod, filtro_black: filt }
    );
    setR(res);
    setSalvando(false);
    router.refresh();
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <span
          className={`rounded-full px-2.5 py-1 text-xs font-semibold border ${
            modoTeste
              ? "bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-500/30"
              : "bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-500/30"
          }`}
        >
          Modo teste {modoTeste ? "LIGADO" : "desligado"}
        </span>
        <button
          className={BTN_LEVE}
          disabled={salvando}
          onClick={() => {
            const msg = modoTeste
              ? "Desligar o modo teste? A partir daí, cada pedido pago da Black sem o pacote vira pedido de Entrega Manual pro time."
              : "Ligar o modo teste? Os pedidos passam a só mostrar o que fariam.";
            if (window.confirm(msg)) salvar({ modo_teste: !modoTeste });
          }}
        >
          {modoTeste ? "Desligar modo teste" : "Ligar modo teste"}
        </button>
      </div>
      <label className="block text-xs text-slate-600 dark:text-zinc-400">
        Telefones que recebem os avisos (com DDI, separados por vírgula)
        <textarea className={`${INPUT} mt-1`} rows={2} value={tel} onChange={(e) => setTel(e.target.value)} placeholder="5511999999999, 5521988888888" />
      </label>
      <div className="grid sm:grid-cols-3 gap-3">
        <label className="block text-xs text-slate-600 dark:text-zinc-400">
          Template de reserva (id, utilidade, 1 parâmetro)
          <input className={`${INPUT} mt-1`} value={tpl} onChange={(e) => setTpl(e.target.value)} />
        </label>
        <label className="block text-xs text-slate-600 dark:text-zinc-400">
          Id do produto da Black na TMB
          <input className={`${INPUT} mt-1`} value={prod} onChange={(e) => setProd(e.target.value)} />
        </label>
        <label className="block text-xs text-slate-600 dark:text-zinc-400">
          Filtro da Black (regex no produto/oferta)
          <input className={`${INPUT} mt-1`} value={filt} onChange={(e) => setFilt(e.target.value)} />
        </label>
      </div>
      <div className="flex items-center gap-2">
        <button className={BTN} disabled={salvando} onClick={() => salvar()}>
          {salvando ? "Salvando..." : "Salvar"}
        </button>
        <Retorno r={r} />
      </div>
    </div>
  );
}

export function TmbSimular() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [nome, setNome] = useState("");
  const [tipo, setTipo] = useState("pago");
  const [r, setR] = useState<{ ok: boolean; mensagem: string } | null>(null);
  const [rodando, setRodando] = useState(false);
  return (
    <div className="space-y-2">
      <div className="grid sm:grid-cols-4 gap-2">
        <input className={INPUT} placeholder="e-mail" value={email} onChange={(e) => setEmail(e.target.value)} />
        <input className={INPUT} placeholder="nome" value={nome} onChange={(e) => setNome(e.target.value)} />
        <select className={INPUT} value={tipo} onChange={(e) => setTipo(e.target.value)}>
          <option value="pago">Entrada paga (Efetivado)</option>
          <option value="cancelado">Cancelado</option>
          <option value="reembolsado">Estornado / reembolso</option>
        </select>
        <button
          className={BTN}
          disabled={rodando || !email}
          onClick={async () => {
            setRodando(true);
            setR(null);
            setR(await postar("/api/tmb/simular", { email, nome, tipo }));
            setRodando(false);
            router.refresh();
          }}
        >
          {rodando ? "Simulando..." : "Simular aviso da TMB"}
        </button>
      </div>
      <Retorno r={r} />
    </div>
  );
}
