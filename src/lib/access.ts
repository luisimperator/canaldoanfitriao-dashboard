// Abas do dashboard e checagem de permissão por aba.
// É a fonte única da lista de abas (usada pelo menu, pelo porteiro e pela
// tela de Usuários).

export interface TabDef {
  href: string;
  label: string;
  icon: string;
  /** Seção do menu (cabeçalho do grupo na barra lateral). */
  section?: string;
}

export const TABS: TabDef[] = [
  { href: "/", label: "Visão geral", icon: "◉", section: "Painel" },
  { href: "/gargalo", label: "Gargalo", icon: "⚑", section: "Painel" },
  { href: "/funil", label: "Funil de vendas", icon: "▼", section: "Comercial" },
  { href: "/crm", label: "CRM", icon: "▦", section: "Comercial" },
  { href: "/atendimento", label: "Funil CRM", icon: "◷", section: "Comercial" },
  { href: "/conversas", label: "Conversas", icon: "💬", section: "Comercial" },
  { href: "/vendas", label: "Vendas & time", icon: "▲", section: "Comercial" },
  { href: "/origem", label: "Origem dos leads", icon: "◆", section: "Aquisição" },
  { href: "/cac", label: "CAC / ROAS", icon: "↗", section: "Aquisição" },
  { href: "/ltv", label: "LTV & recompra", icon: "∞", section: "Comercial" },
  { href: "/suporte", label: "Suporte", icon: "🛟", section: "Suporte" },
  { href: "/financeiro", label: "Financeiro", icon: "$", section: "Financeiro" },
  { href: "/integracoes", label: "Integrações", icon: "⚙", section: "Configurações" },
];

export const ADMIN_TAB: TabDef = {
  href: "/usuarios",
  label: "Usuários",
  icon: "◐",
  section: "Configurações",
};

export const ALL_TAB_HREFS = TABS.map((t) => t.href);

export interface Access {
  email: string | null;
  isAdmin: boolean;
  tabs: string[];
  authed: boolean;
}

// Qual aba "dona" de um pathname? "/" só casa exato; as demais casam o prefixo
// (ex.: /conversas e /conversas/123 pertencem à aba /conversas).
export function tabForPath(pathname: string): string | null {
  if (pathname === "/") return "/";
  for (const t of TABS) {
    if (t.href !== "/" && (pathname === t.href || pathname.startsWith(t.href + "/"))) {
      return t.href;
    }
  }
  if (pathname === ADMIN_TAB.href || pathname.startsWith(ADMIN_TAB.href + "/")) {
    return ADMIN_TAB.href;
  }
  return null;
}

// O usuário pode acessar esse pathname?
export function canAccess(pathname: string, access: Pick<Access, "isAdmin" | "tabs">): boolean {
  const tab = tabForPath(pathname);
  if (tab === null) return true; // rota não mapeada (não é aba) — não bloqueia aqui
  if (tab === ADMIN_TAB.href) return access.isAdmin;
  if (access.isAdmin) return true;
  return access.tabs.includes(tab);
}
