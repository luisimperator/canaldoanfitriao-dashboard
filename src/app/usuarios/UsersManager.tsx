"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Card } from "@/components/ui";
import type { TabDef } from "@/lib/access";

export interface UserRow {
  id: string;
  email: string;
  isAdmin: boolean;
  tabs: string[];
  createdAt: string | null;
}

async function post(body: Record<string, unknown>): Promise<{ ok?: boolean; error?: string }> {
  const res = await fetch("/api/admin/users", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.json().catch(() => ({ error: "Erro de rede." }));
}

function TabPicker({
  allTabs,
  selected,
  onToggle,
  disabled,
}: {
  allTabs: TabDef[];
  selected: string[];
  onToggle: (href: string) => void;
  disabled: boolean;
}) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
      {allTabs.map((t) => (
        <label
          key={t.href}
          className={`flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-xs cursor-pointer ${
            disabled ? "opacity-50" : ""
          } ${selected.includes(t.href) ? "border-rose-300 bg-rose-50 text-slate-800" : "border-slate-200 text-slate-600"}`}
        >
          <input
            type="checkbox"
            className="accent-rose-600"
            disabled={disabled}
            checked={disabled || selected.includes(t.href)}
            onChange={() => onToggle(t.href)}
          />
          {t.label}
        </label>
      ))}
    </div>
  );
}

export function UsersManager({
  initialUsers,
  allTabs,
  currentEmail,
}: {
  initialUsers: UserRow[];
  allTabs: TabDef[];
  currentEmail: string | null;
}) {
  const router = useRouter();
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  // novo usuário
  const [nEmail, setNEmail] = useState("");
  const [nPass, setNPass] = useState("");
  const [nAdmin, setNAdmin] = useState(false);
  const [nTabs, setNTabs] = useState<string[]>(allTabs.map((t) => t.href));

  // edição inline
  const [editId, setEditId] = useState<string | null>(null);
  const [eTabs, setETabs] = useState<string[]>([]);
  const [eAdmin, setEAdmin] = useState(false);

  function flash(type: "ok" | "err", text: string) {
    setMsg({ type, text });
    setTimeout(() => setMsg(null), 4000);
  }

  async function run(body: Record<string, unknown>, okMsg: string) {
    setBusy(true);
    const r = await post(body);
    setBusy(false);
    if (r.error) {
      flash("err", r.error);
      return false;
    }
    flash("ok", okMsg);
    router.refresh();
    return true;
  }

  async function createUser() {
    const ok = await run(
      { action: "create", email: nEmail, password: nPass, isAdmin: nAdmin, tabs: nTabs },
      "Usuário criado."
    );
    if (ok) {
      setNEmail("");
      setNPass("");
      setNAdmin(false);
      setNTabs(allTabs.map((t) => t.href));
    }
  }

  async function resetPassword(u: UserRow) {
    const senha = window.prompt(`Nova senha para ${u.email}:`);
    if (senha === null) return;
    await run({ action: "reset", userId: u.id, password: senha }, "Senha redefinida.");
  }

  async function deleteUser(u: UserRow) {
    if (!window.confirm(`Excluir ${u.email}? Esta ação não pode ser desfeita.`)) return;
    await run({ action: "delete", userId: u.id }, "Usuário excluído.");
  }

  function startEdit(u: UserRow) {
    setEditId(u.id);
    setEAdmin(u.isAdmin);
    setETabs(u.tabs.length ? u.tabs : allTabs.map((t) => t.href));
  }

  async function saveEdit(u: UserRow) {
    const ok = await run({ action: "update", userId: u.id, isAdmin: eAdmin, tabs: eTabs }, "Acesso atualizado.");
    if (ok) setEditId(null);
  }

  return (
    <div className="space-y-4">
      {msg && (
        <div
          className={`rounded-lg px-4 py-2.5 text-sm ${
            msg.type === "ok" ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"
          }`}
        >
          {msg.text}
        </div>
      )}

      <Card title="Novo usuário">
        <div className="grid sm:grid-cols-2 gap-3 mb-3">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">E-mail</label>
            <input
              type="email"
              value={nEmail}
              onChange={(e) => setNEmail(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              placeholder="pessoa@empresa.com"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Senha inicial</label>
            <input
              type="text"
              value={nPass}
              onChange={(e) => setNPass(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              placeholder="mín. 4 caracteres"
            />
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-700 mb-2">
          <input type="checkbox" className="accent-rose-600" checked={nAdmin} onChange={(e) => setNAdmin(e.target.checked)} />
          Administrador (vê tudo e gerencia usuários)
        </label>
        <div className="text-xs font-medium text-slate-500 mb-1.5">Abas que pode ver</div>
        <TabPicker
          allTabs={allTabs}
          selected={nTabs}
          disabled={nAdmin}
          onToggle={(href) => setNTabs((s) => (s.includes(href) ? s.filter((x) => x !== href) : [...s, href]))}
        />
        <div className="mt-3">
          <button
            onClick={createUser}
            disabled={busy}
            className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-60"
          >
            Criar usuário
          </button>
        </div>
      </Card>

      <Card title={`Usuários (${initialUsers.length})`}>
        <div className="space-y-2">
          {initialUsers.map((u) => (
            <div key={u.id} className="rounded-lg border border-slate-200 p-3">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                  <div className="text-sm font-medium text-slate-800 flex items-center gap-2">
                    {u.email}
                    {u.isAdmin && (
                      <span className="rounded-full bg-slate-900 px-2 py-0.5 text-[10px] font-semibold text-white">ADMIN</span>
                    )}
                    {u.email === currentEmail && <span className="text-[10px] text-slate-400">(você)</span>}
                  </div>
                  <div className="text-xs text-slate-400 mt-0.5">
                    {u.isAdmin ? "Todas as abas" : `${u.tabs.length} aba(s)`}
                  </div>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <button onClick={() => startEdit(u)} className="rounded-md bg-slate-100 px-2.5 py-1 font-medium text-slate-700 hover:bg-slate-200">
                    Editar acesso
                  </button>
                  <button onClick={() => resetPassword(u)} className="rounded-md bg-slate-100 px-2.5 py-1 font-medium text-slate-700 hover:bg-slate-200">
                    Resetar senha
                  </button>
                  <button
                    onClick={() => deleteUser(u)}
                    disabled={u.email === currentEmail}
                    className="rounded-md bg-rose-50 px-2.5 py-1 font-medium text-rose-600 hover:bg-rose-100 disabled:opacity-40"
                  >
                    Excluir
                  </button>
                </div>
              </div>

              {editId === u.id && (
                <div className="mt-3 border-t border-slate-100 pt-3">
                  <label className="flex items-center gap-2 text-sm text-slate-700 mb-2">
                    <input type="checkbox" className="accent-rose-600" checked={eAdmin} onChange={(e) => setEAdmin(e.target.checked)} />
                    Administrador
                  </label>
                  <TabPicker
                    allTabs={allTabs}
                    selected={eTabs}
                    disabled={eAdmin}
                    onToggle={(href) => setETabs((s) => (s.includes(href) ? s.filter((x) => x !== href) : [...s, href]))}
                  />
                  <div className="mt-3 flex gap-2">
                    <button
                      onClick={() => saveEdit(u)}
                      disabled={busy}
                      className="rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-rose-700 disabled:opacity-60"
                    >
                      Salvar
                    </button>
                    <button onClick={() => setEditId(null)} className="rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-200">
                      Cancelar
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
        <p className="mt-3 text-xs text-slate-400">
          Mudanças de aba valem no próximo login da pessoa (ou quando a sessão dela renova). Quem é
          admin sempre vê tudo.
        </p>
      </Card>
    </div>
  );
}
