"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, useTransition } from "react";

const links = [
  { href: "/", label: "Visão geral", icon: "◉" },
  { href: "/gargalo", label: "Gargalo", icon: "⚑" },
  { href: "/funil", label: "Funil de vendas", icon: "▼" },
  { href: "/crm", label: "CRM", icon: "▦" },
  { href: "/vendas", label: "Vendas & time", icon: "▲" },
  { href: "/origem", label: "Origem das vendas", icon: "◆" },
  { href: "/cac", label: "CAC / ROAS", icon: "↗" },
  { href: "/ltv", label: "LTV & recompra", icon: "∞" },
  { href: "/financeiro", label: "Financeiro", icon: "$" },
  { href: "/integracoes", label: "Integrações", icon: "⚙" },
];

// Navegação com estado "pendente": ao clicar, o item já fica destacado e mostra
// um spinner na hora (feedback imediato), antes mesmo de a página carregar.
// Sem isso, clicar no menu não dava retorno e dava a impressão de não ter
// funcionado. O pendente é limpo quando a rota efetivamente muda.
function useNav() {
  const pathname = usePathname();
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [pending, setPending] = useState<string | null>(null);

  // Derivado: quando a rota chega no destino, o pendente "se apaga" sozinho
  // (sem useEffect/setState, que o lint desaconselha).
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

export function Sidebar() {
  const { pathname, pending, navigate } = useNav();

  return (
    <>
      {/* Celular: barra superior com navegação horizontal */}
      <header className="lg:hidden sticky top-0 z-20 bg-[#0b1018] text-slate-200 shadow-md">
        <div className="flex items-baseline gap-2 px-4 pt-3 pb-2">
          <span className="text-base font-bold text-white leading-tight">
            Canal do Anfitrião
          </span>
          <span className="text-[11px] text-teal-300 font-medium">dashboard</span>
        </div>
        <nav className="flex gap-2 overflow-x-auto px-4 pb-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {links.map((link) => {
            const active = pathname === link.href || pending === link.href;
            return (
              <Link
                key={link.href}
                href={link.href}
                onClick={(e) => {
                  e.preventDefault();
                  navigate(link.href);
                }}
                className={`flex items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 py-1.5 text-sm transition-colors ${
                  active
                    ? "bg-rose-600 text-white font-semibold"
                    : "bg-white/5 text-slate-300"
                }`}
              >
                {link.label}
                {pending === link.href && (
                  <span className="h-3 w-3 shrink-0 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                )}
              </Link>
            );
          })}
        </nav>
      </header>

      {/* Desktop: barra lateral */}
      <aside className="hidden lg:flex w-60 shrink-0 bg-[#0b1018] text-slate-200 flex-col">
        <div className="px-5 py-6 border-b border-white/10">
          <div className="text-lg font-bold text-white leading-tight">
            Canal do Anfitrião
          </div>
          <div className="text-xs text-teal-300 font-medium mt-0.5">dashboard</div>
        </div>
        <nav className="flex-1 px-3 py-4 space-y-1">
          {links.map((link) => {
            const active = pathname === link.href || pending === link.href;
            return (
              <Link
                key={link.href}
                href={link.href}
                onClick={(e) => {
                  e.preventDefault();
                  navigate(link.href);
                }}
                className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
                  active
                    ? "bg-rose-600 text-white font-semibold"
                    : "hover:bg-white/5 text-slate-300"
                }`}
              >
                <span className="w-4 text-center text-xs opacity-80">{link.icon}</span>
                {link.label}
                {pending === link.href && <Spinner />}
              </Link>
            );
          })}
        </nav>
        <div className="px-5 py-4 text-[11px] text-slate-500 border-t border-white/10">
          Eduzz · Unnichat · Mailchimp
          <br />
          Meta Ads · Banco Inter
        </div>
      </aside>
    </>
  );
}
