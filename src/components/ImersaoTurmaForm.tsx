"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

// Criar/editar uma turma da Imersão A5E. Horários em HH:MM (São Paulo); em
// branco = padrão 9h às 16h.

export interface TurmaFormValores {
  turma_data: string;
  sala_url_sabado: string;
  sala_url_domingo: string;
  inicio_sabado: string;
  fim_sabado: string;
  inicio_domingo: string;
  fim_domingo: string;
  grupo_vip_url: string;
  grupo_vip_url_2: string;
  grupo_vip_cheio: boolean;
  ativa: boolean;
  unnichat_tag_id: string;
}

const VAZIO: TurmaFormValores = {
  turma_data: "",
  sala_url_sabado: "",
  sala_url_domingo: "",
  inicio_sabado: "09:00",
  fim_sabado: "16:00",
  inicio_domingo: "09:00",
  fim_domingo: "16:00",
  grupo_vip_url: "",
  grupo_vip_url_2: "",
  grupo_vip_cheio: false,
  ativa: true,
  unnichat_tag_id: "",
};

export function ImersaoTurmaForm({
  inicial,
  sugestao,
}: {
  /** turma existente (edição); sem ela, cria uma nova */
  inicial?: TurmaFormValores;
  /** sábado sugerido para a turma nova */
  sugestao?: string;
}) {
  const router = useRouter();
  const editando = !!inicial;
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tipo: "erro" | "aviso"; texto: string } | null>(null);
  const [form, setForm] = useState<TurmaFormValores>(inicial ?? { ...VAZIO, turma_data: sugestao ?? "" });

  const upd = <K extends keyof TurmaFormValores>(k: K, v: TurmaFormValores[K]) => setForm((f) => ({ ...f, [k]: v }));
  const field = "w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink";
  const lbl = "mb-1 block text-xs font-semibold text-ink-2";

  async function submit() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(
        editando ? `/api/imersao/turmas?turma=${encodeURIComponent(form.turma_data)}` : "/api/imersao/turmas",
        {
          method: editando ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(form),
        }
      );
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMsg({ tipo: "erro", texto: j.error ?? `Erro ${res.status}` });
        return;
      }
      if (j.aviso) setMsg({ tipo: "aviso", texto: j.aviso });
      else setOpen(false);
      if (!editando) setForm({ ...VAZIO });
      router.refresh();
    } catch {
      setMsg({ tipo: "erro", texto: "Falha de rede" });
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className={
          editando
            ? "rounded-md border border-line px-2 py-1 text-xs text-ink-2 hover:bg-black/[0.03] dark:hover:bg-white/[0.06]"
            : "rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-500"
        }
      >
        {editando ? "Editar" : "+ Nova turma"}
      </button>
    );
  }

  const hora = (k: "inicio_sabado" | "fim_sabado" | "inicio_domingo" | "fim_domingo", label: string) => (
    <div>
      <label className={lbl}>{label}</label>
      <input type="time" className={field} value={form[k]} onChange={(e) => upd(k, e.target.value)} />
    </div>
  );

  return (
    <div className="mt-3 w-full space-y-3 rounded-xl border border-line bg-black/[0.02] p-4 text-left dark:bg-white/[0.03]">
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className={lbl}>Turma (data do sábado)</label>
          <input
            type="date"
            className={field}
            value={form.turma_data}
            disabled={editando}
            onChange={(e) => upd("turma_data", e.target.value)}
          />
        </div>
        <div className="flex items-end gap-4 pb-2 text-sm text-ink">
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={form.ativa} onChange={(e) => upd("ativa", e.target.checked)} />
            Ativa
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={form.grupo_vip_cheio}
              onChange={(e) => upd("grupo_vip_cheio", e.target.checked)}
            />
            Grupo VIP cheio (usar o reserva)
          </label>
        </div>

        <div className="sm:col-span-2">
          <label className={lbl}>Sala do sábado (Hotwebinar)</label>
          <input className={field} value={form.sala_url_sabado} onChange={(e) => upd("sala_url_sabado", e.target.value)} placeholder="https://…" />
        </div>
        {hora("inicio_sabado", "Início sábado")}
        {hora("fim_sabado", "Fim sábado")}

        <div className="sm:col-span-2">
          <label className={lbl}>Sala do domingo (Hotwebinar)</label>
          <input className={field} value={form.sala_url_domingo} onChange={(e) => upd("sala_url_domingo", e.target.value)} placeholder="https://…" />
        </div>
        {hora("inicio_domingo", "Início domingo")}
        {hora("fim_domingo", "Fim domingo")}

        <div className="sm:col-span-2">
          <label className={lbl}>Grupo VIP (convite da comunidade / grupo de avisos)</label>
          <input className={field} value={form.grupo_vip_url} onChange={(e) => upd("grupo_vip_url", e.target.value)} placeholder="https://chat.whatsapp.com/…" />
        </div>
        <div className="sm:col-span-2">
          <label className={lbl}>Grupo VIP reserva</label>
          <input className={field} value={form.grupo_vip_url_2} onChange={(e) => upd("grupo_vip_url_2", e.target.value)} placeholder="usado quando o principal está cheio" />
        </div>
        <div className="sm:col-span-2">
          <label className={lbl}>Id da tag datada no Unnichat (opcional)</label>
          <input className={field} value={form.unnichat_tag_id} onChange={(e) => upd("unnichat_tag_id", e.target.value)} placeholder={`id da tag imersao-a5e-pago-${form.turma_data || "AAAA-MM-DD"}`} />
          <p className="mt-1 text-[11px] text-ink-2">
            Com o id, o painel aplica a tag datada no contato do Unnichat. Sem ele, fica com a automação semanal do Unnichat.
          </p>
        </div>
      </div>

      {msg && (
        <p className={msg.tipo === "erro" ? "text-sm text-rose-600 dark:text-rose-400" : "text-sm text-amber-600 dark:text-amber-400"}>
          {msg.texto}
        </p>
      )}

      <div className="flex gap-2">
        <button
          onClick={submit}
          disabled={busy || !form.turma_data}
          className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-500 disabled:opacity-50"
        >
          {busy ? "Salvando…" : editando ? "Salvar" : "Criar turma"}
        </button>
        <button
          onClick={() => {
            setOpen(false);
            setMsg(null);
          }}
          className="rounded-lg border border-line px-4 py-2 text-sm text-ink-2"
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}
