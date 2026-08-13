"use client";

import { useEffect, useState } from "react";

// Envio de template aprovado — o único caminho quando a janela de 24h fechou.
// Antes o painel avisava "use um template" e não oferecia nenhum: a conversa
// simplesmente morria ali.

interface Template {
  name: string;
  language: string;
  category: string | null;
  body: string;
  header: string | null;
  footer: string | null;
  variaveis: number;
}

function preencher(texto: string, valores: string[]): string {
  return texto.replace(/\{\{(\d+)\}\}/g, (_, n) => valores[Number(n) - 1] || `{{${n}}}`);
}

export function TemplatePicker({
  phone,
  onEnviado,
}: {
  phone: string;
  onEnviado: () => void;
}) {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erroLista, setErroLista] = useState<string | null>(null);
  const [escolhido, setEscolhido] = useState<string>("");
  const [valores, setValores] = useState<string[]>([]);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    fetch("/api/support/templates")
      .then((r) => r.json())
      .then((j) => {
        if (!vivo) return;
        if (j.error) setErroLista(j.error);
        else setTemplates(j.templates ?? []);
      })
      .catch(() => vivo && setErroLista("Falha ao carregar os templates."))
      .finally(() => vivo && setCarregando(false));
    return () => {
      vivo = false;
    };
  }, []);

  const t = templates.find((x) => x.name === escolhido) ?? null;
  const preview = t ? preencher(t.body, valores) : "";
  const faltaPreencher = t ? valores.slice(0, t.variaveis).some((v) => !v?.trim()) : false;
  const prontoParaEnviar = Boolean(t) && (!t?.variaveis || !faltaPreencher);

  async function enviar() {
    if (!t) return;
    setEnviando(true);
    setErro(null);
    try {
      const res = await fetch("/api/support/inbox", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone,
          template: {
            name: t.name,
            language: t.language,
            variaveis: valores.slice(0, t.variaveis),
          },
          preview,
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErro(j.error ?? `Erro ${res.status}`);
        return;
      }
      setEscolhido("");
      setValores([]);
      onEnviado();
    } catch {
      setErro("Falha de rede");
    } finally {
      setEnviando(false);
    }
  }

  const campo =
    "w-full rounded-lg border border-slate-300 dark:border-white/15 bg-white dark:bg-white/5 px-3 py-2 text-sm text-slate-900 dark:text-zinc-100";

  return (
    <div className="space-y-2">
      <p className="rounded-lg bg-amber-50 dark:bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-200">
        Janela de 24h fechada — o WhatsApp não entrega mensagem livre agora. Use um template
        aprovado abaixo, ou espere o cliente escrever de novo.
      </p>

      {carregando && (
        <p className="text-xs text-slate-500 dark:text-zinc-400">Carregando templates…</p>
      )}

      {erroLista && (
        <p className="rounded-lg bg-rose-50 dark:bg-rose-500/10 px-3 py-2 text-xs text-rose-700 dark:text-rose-300">
          {erroLista}
        </p>
      )}

      {!carregando && !erroLista && templates.length === 0 && (
        <p className="text-xs text-slate-500 dark:text-zinc-400">
          Nenhum template aprovado na conta. Crie um no Gerenciador do WhatsApp da Meta — só
          entram aqui os que estiverem com status <strong>APPROVED</strong>.
        </p>
      )}

      {templates.length > 0 && (
        <>
          <select
            value={escolhido}
            onChange={(e) => {
              setEscolhido(e.target.value);
              setValores([]);
              setErro(null);
            }}
            className={campo}
          >
            <option value="">Escolha um template aprovado…</option>
            {templates.map((tp) => (
              <option key={`${tp.name}-${tp.language}`} value={tp.name}>
                {tp.name} ({tp.language}){tp.category ? ` · ${tp.category}` : ""}
              </option>
            ))}
          </select>

          {t && t.variaveis > 0 && (
            <div className="grid gap-2 sm:grid-cols-2">
              {Array.from({ length: t.variaveis }, (_, i) => (
                <input
                  key={i}
                  className={campo}
                  placeholder={`Valor de {{${i + 1}}}`}
                  value={valores[i] ?? ""}
                  onChange={(e) => {
                    const novos = [...valores];
                    novos[i] = e.target.value;
                    setValores(novos);
                  }}
                />
              ))}
            </div>
          )}

          {t && (
            <div className="rounded-lg border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/[0.03] px-3 py-2">
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400 dark:text-zinc-500">
                Como o cliente vai receber
              </p>
              {t.header && (
                <p className="text-xs font-semibold text-slate-900 dark:text-zinc-100">{t.header}</p>
              )}
              <p className="whitespace-pre-wrap text-sm text-slate-800 dark:text-zinc-200">
                {preview}
              </p>
              {t.footer && (
                <p className="mt-1 text-[11px] text-slate-400 dark:text-zinc-500">{t.footer}</p>
              )}
            </div>
          )}

          {erro && <p className="text-xs text-rose-600 dark:text-rose-400">{erro}</p>}

          <button
            onClick={enviar}
            disabled={!prontoParaEnviar || enviando}
            className="rounded-lg bg-slate-900 dark:bg-violet-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            {enviando ? "Enviando…" : "Enviar template"}
          </button>
        </>
      )}
    </div>
  );
}
