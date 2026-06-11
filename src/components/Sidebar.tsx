"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/", label: "Visão geral", icon: "◉" },
  { href: "/gargalo", label: "Gargalo", icon: "⚑" },
  { href: "/funil", label: "Funil de vendas", icon: "▼" },
  { href: "/vendas", label: "Vendas & time", icon: "▲" },
  { href: "/financeiro", label: "Financeiro", icon: "$" },
  { href: "/integracoes", label: "Integrações", icon: "⚙" },
];

export function Sidebar() {
  const pathname = usePathname();
  return (
    <>
      {/* Celular: barra superior com navegação horizontal */}
      <header className="lg:hidden sticky top-0 z-20 bg-slate-900 text-slate-200 shadow-md">
        <div className="flex items-baseline gap-2 px-4 pt-3 pb-2">
          <span className="text-base font-bold text-white leading-tight">
            Canal do Anfitrião
          </span>
          <span className="text-[11px] text-rose-400 font-medium">dashboard</span>
        </div>
        <nav className="flex gap-2 overflow-x-auto px-4 pb-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {links.map((link) => {
            const active = pathname === link.href;
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`whitespace-nowrap rounded-full px-3.5 py-1.5 text-sm transition-colors ${
                  active
                    ? "bg-rose-600 text-white font-semibold"
                    : "bg-slate-800 text-slate-300"
                }`}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>
      </header>

      {/* Desktop: barra lateral */}
      <aside className="hidden lg:flex w-60 shrink-0 bg-slate-900 text-slate-200 flex-col">
        <div className="px-5 py-6 border-b border-slate-800">
          <div className="text-lg font-bold text-white leading-tight">
            Canal do Anfitrião
          </div>
          <div className="text-xs text-rose-400 font-medium mt-0.5">dashboard</div>
        </div>
        <nav className="flex-1 px-3 py-4 space-y-1">
          {links.map((link) => {
            const active = pathname === link.href;
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
                  active
                    ? "bg-rose-600 text-white font-semibold"
                    : "hover:bg-slate-800 text-slate-300"
                }`}
              >
                <span className="w-4 text-center text-xs opacity-80">{link.icon}</span>
                {link.label}
              </Link>
            );
          })}
        </nav>
        <div className="px-5 py-4 text-[11px] text-slate-500 border-t border-slate-800">
          Eduzz · Unnichat · Mailchimp
          <br />
          Meta Ads · Banco Inter
        </div>
      </aside>
    </>
  );
}
