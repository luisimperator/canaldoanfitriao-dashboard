"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { createBrowserClient } from "@supabase/ssr";
import type { TabDef } from "@/lib/access";
import { InstallButton } from "@/components/InstallButton";
import { ThemeToggle } from "@/components/ThemeToggle";
import { PushVendasButton } from "@/components/PushVendasButton";

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
    <span className="ml-auto h-3.5 w-3.5 shrink-0 animate-spin rounded-full border-2 border-current/30 border-t-current" />
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

// Marca: a estrela do logo do Canal do Anfitrião sobre o degradê coral → teal.
function Marca({ tamanho = 36 }: { tamanho?: number }) {
  return (
    <span
      className="flex shrink-0 items-center justify-center rounded-[12px] shadow-[0_6px_16px_-6px_rgba(239,62,92,0.6)]"
      style={{ width: tamanho, height: tamanho, background: "linear-gradient(135deg, #f2405a 0%, #b14a6e 50%, #0a9497 100%)" }}
    >
      <svg viewBox="0 0 192 166" width={tamanho * 0.58} height={tamanho * 0.5} aria-hidden="true" fill="#fff">
        <path d="M95.7 0 L103.5 23 L129 23.8 L113.5 35.2 Q95.7 25 77.5 35.2 L63 23.6 L88 23 Z" />
        <path d="M65 112.5 L127 112.5 Q128.6 112.5 129.2 114.2 L145 166 L96 135 L47 166 L62.8 114.2 Q63.4 112.5 65 112.5 Z" />
        <rect x="40" y="52" width="112" height="40" rx="8" opacity="0.92" />
      </svg>
    </span>
  );
}

function Brand() {
  return (
    <div className="flex items-center gap-3">
      <Marca />
      <span className="leading-tight">
        <span className="block text-[15px] font-semibold tracking-[-0.01em] text-[var(--nav-ink)]">Canal do Anfitrião</span>
        <span className="block text-[11px] font-medium text-[var(--nav-muted)]">painel</span>
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
          <div className="px-3 mt-4 mb-1.5 font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-[var(--nav-muted)]">
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
                  className={`relative flex items-center gap-3 rounded-full px-3.5 py-2 text-[13.5px] transition-colors ${
                    active
                      ? "bg-[var(--nav-active)] font-semibold text-[var(--nav-active-ink)] shadow-sm"
                      : "text-[var(--nav-ink)] opacity-80 hover:opacity-100 hover:bg-[var(--nav-hover)]"
                  }`}
                >
                  <span className={`w-4 text-center text-xs ${active ? "text-[var(--brand)]" : "opacity-70"}`}>{link.icon}</span>
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
  avisoVendas,
}: {
  email: string | null;
  logout: () => void;
  loading: boolean;
  /** Quem vê a aba Vendas pode ligar o aviso de venda nova. */
  avisoVendas: boolean;
}) {
  return (
    <div className="border-t border-line px-4 py-3 text-[11px] text-[var(--nav-muted)]">
      <InstallButton />
      {email && avisoVendas && <PushVendasButton />}
      {email ? (
        <div className="flex items-center justify-between gap-2">
          <ThemeToggle />
          <span className="truncate">{email}</span>
          <button
            onClick={logout}
            disabled={loading}
            className="shrink-0 rounded-full border border-line px-2.5 py-1 text-[var(--nav-ink)] hover:bg-[var(--nav-hover)]"
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
      <header className="lg:hidden sticky top-0 z-30 flex items-center gap-3 border-b border-line bg-[var(--nav)]/90 backdrop-blur px-4 py-3 text-[var(--nav-ink)]">
        <button
          onClick={() => setOpen(true)}
          aria-label="Abrir menu"
          className="rounded-full p-1.5 hover:bg-[var(--nav-hover)]"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
        <Marca tamanho={28} />
        <span className="text-[15px] font-semibold">Canal do Anfitrião</span>
        <ThemeToggle className="ml-auto" />
      </header>

      {/* Celular: drawer lateral deslizante */}
      {open && (
        <div className="lg:hidden fixed inset-0 z-40">
          <div className="absolute inset-0 bg-black/60" onClick={() => setOpen(false)} />
          <aside className="absolute left-0 top-0 flex h-full w-72 max-w-[85%] flex-col bg-[var(--nav)] text-[var(--nav-ink)] shadow-2xl">
            <div className="flex items-center justify-between border-b border-line px-4 py-4">
              <Brand />
              <button
                onClick={() => setOpen(false)}
                aria-label="Fechar menu"
                className="rounded-full p-1.5 text-[var(--nav-muted)] hover:bg-[var(--nav-hover)]"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="M6 6l12 12M18 6L6 18" />
                </svg>
              </button>
            </div>
            <nav className="flex-1 overflow-y-auto px-3 py-3">
              <NavItems tabs={tabs} pathname={pathname} pending={pending} onClick={go} />
            </nav>
            <Footer email={email} logout={logout} loading={loading} avisoVendas={tabs.some((t) => t.href === "/vendas")} />
          </aside>
        </div>
      )}

      {/* Desktop: barra lateral fixa */}
      <aside className="hidden lg:flex sticky top-3 m-3 mr-0 h-[calc(100vh-24px)] w-60 shrink-0 flex-col overflow-hidden rounded-[24px] border border-line bg-[var(--nav)] text-[var(--nav-ink)] shadow-[0_1px_2px_rgba(16,24,40,0.04),0_12px_32px_-16px_rgba(16,24,40,0.12)] dark:shadow-none">
        <div className="px-5 pt-5 pb-3">
          <Brand />
        </div>
        <nav className="flex-1 overflow-y-auto px-3 py-4">
          <NavItems tabs={tabs} pathname={pathname} pending={pending} onClick={navigate} />
        </nav>
        <Footer email={email} logout={logout} loading={loading} avisoVendas={tabs.some((t) => t.href === "/vendas")} />
      </aside>
    </>
  );
}
