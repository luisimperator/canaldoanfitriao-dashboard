"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { createBrowserClient } from "@supabase/ssr";
import type { TabDef } from "@/lib/access";
import { InstallButton } from "@/components/InstallButton";

// Navegação com estado "pendente": ao clicar, o item já fica destacado e mostra
// um spinner na hora (feedback imediato), antes mesmo de a página carregar.
function useNav() {
  const pathname = usePathname();
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [pending, setPending] = useState<string | null>(null);

  const pendingHref = pending && pending !== pathname ? pending : null;

  function navigate(href: string) {
    if (href === pathname) return;
    setPending(href);
    startTransition(() => router.push(href));
  }

  return { pathname, pending: pendingHref, navigate };
}

function Spinner() {
  return (
    <span className="ml-auto h-3.5 w-3.5 shrink-0 animate-spin rounded-full border-2 border-white/40 border-t-white" />
  );
}

function useLogout() {
  const [loading, setLoading] = useState(false);
  async function logout() {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) return;
    setLoading(true);
    const supabase = createBrowserClient(url, key);
    await supabase.auth.signOut();
    window.location.href = "/login";
  }
  return { logout, loading };
}

function groupBySection(tabs: TabDef[]): { section: string; items: TabDef[] }[] {
  const order: string[] = [];
  const map = new Map<string, TabDef[]>();
  for (const t of tabs) {
    const s = t.section ?? "Outros";
    if (!map.has(s)) {
      map.set(s, []);
      order.push(s);
    }
    map.get(s)!.push(t);
  }
  return order.map((s) => ({ section: s, items: map.get(s)! }));
}

function Brand() {
  return (
    <div className="flex items-center gap-2.5">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-rose-600 text-lg font-bold text-white shadow">
        ↗
      </span>
      <span className="leading-tight">
        <span className="block text-base font-bold text-white">Canal do Anfitrião</span>
        <span className="block text-[11px] font-medium text-rose-400">dashboard</span>
      </span>
    </div>
  );
}

function NavItems({
  tabs,
  pathname,
  pending,
  onClick,
}: {
  tabs: TabDef[];
  pathname: string;
  pending: string | null;
  onClick: (href: string) => void;
}) {
  return (
    <>
      {groupBySection(tabs).map((group) => (
        <div key={group.section} className="mb-1.5">
          <div className="px-3 mt-3 mb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
            {group.section}
          </div>
          <div className="space-y-0.5">
            {group.items.map((link) => {
              const active = pathname === link.href || pending === link.href;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={(e) => {
                    e.preventDefault();
                    onClick(link.href);
                  }}
                  className={`relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
                    active
                      ? "bg-slate-800 font-semibold text-white"
                      : "text-slate-300 hover:bg-slate-800/60"
                  }`}
                >
                  {active && (
                    <span className="absolute left-0 top-1.5 bottom-1.5 w-1 rounded-r bg-rose-500" />
                  )}
                  <span className="w-4 text-center text-xs opacity-80">{link.icon}</span>
                  <span className="truncate">{link.label}</span>
                  {pending === link.href && <Spinner />}
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </>
  );
}

function Footer({
  email,
  logout,
  loading,
}: {
  email: string | null;
  logout: () => void;
  loading: boolean;
}) {
  return (
    <div className="border-t border-slate-800 px-4 py-3 text-[11px] text-slate-500">
      <InstallButton />
      {email ? (
        <div className="flex items-center justify-between gap-2">
          <span className="truncate text-slate-400">{email}</span>
          <button
            onClick={logout}
            disabled={loading}
            className="shrink-0 rounded-md border border-slate-700 px-2 py-1 text-slate-300 hover:bg-slate-800"
          >
            {loading ? "…" : "Sair"}
          </button>
        </div>
      ) : (
        <span>Eduzz · Unnichat · Mailchimp · Meta Ads · Banco Inter</span>
      )}
    </div>
  );
}

export function Sidebar({ tabs, email }: { tabs: TabDef[]; email: string | null }) {
  const { pathname, pending, navigate } = useNav();
  const { logout, loading } = useLogout();
  const [open, setOpen] = useState(false);

  const go = (href: string) => {
    navigate(href);
    setOpen(false);
  };

  return (
    <>
      {/* Celular: barra superior só com a marca + hambúrguer */}
      <header className="lg:hidden sticky top-0 z-30 flex items-center gap-3 bg-slate-900 px-4 py-3 text-slate-200 shadow-md">
        <button
          onClick={() => setOpen(true)}
          aria-label="Abrir menu"
          className="rounded-md p-1.5 text-slate-300 hover:bg-slate-800"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
        <span className="text-base font-bold text-white">Canal do Anfitrião</span>
        <span className="text-[11px] font-medium text-rose-400">dashboard</span>
      </header>

      {/* Celular: drawer lateral deslizante */}
      {open && (
        <div className="lg:hidden fixed inset-0 z-40">
          <div className="absolute inset-0 bg-black/60" onClick={() => setOpen(false)} />
          <aside className="absolute left-0 top-0 flex h-full w-72 max-w-[85%] flex-col bg-slate-900 text-slate-200 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 px-4 py-4">
              <Brand />
              <button
                onClick={() => setOpen(false)}
                aria-label="Fechar menu"
                className="rounded-md p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="M6 6l12 12M18 6L6 18" />
                </svg>
              </button>
            </div>
            <nav className="flex-1 overflow-y-auto px-3 py-3">
              <NavItems tabs={tabs} pathname={pathname} pending={pending} onClick={go} />
            </nav>
            <Footer email={email} logout={logout} loading={loading} />
          </aside>
        </div>
      )}

      {/* Desktop: barra lateral fixa */}
      <aside className="hidden lg:flex w-60 shrink-0 flex-col bg-slate-900 text-slate-200">
        <div className="border-b border-slate-800 px-5 py-5">
          <Brand />
        </div>
        <nav className="flex-1 overflow-y-auto px-3 py-4">
          <NavItems tabs={tabs} pathname={pathname} pending={pending} onClick={navigate} />
        </nav>
        <Footer email={email} logout={logout} loading={loading} />
      </aside>
    </>
  );
}
