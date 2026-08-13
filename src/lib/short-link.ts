import { headers } from "next/headers";

// Base do link curto que vai no QR.
//
// O padrão era `https://link.canaldoanfitriao.com.br` fixo no código — mas esse
// subdomínio nunca foi provisionado, então todo QR gerado apontava para um
// ERR_NAME_NOT_RESOLVED. QR impresso é irreversível: não dá para depender de um
// DNS que talvez exista.
//
// Agora o padrão é o próprio domínio do dashboard, servindo /r/<slug> — que já
// funciona hoje, sem configurar nada. O subdomínio curto continua suportado:
// basta apontar o DNS e definir NEXT_PUBLIC_SHORT_LINK_BASE. O proxy (src/proxy.ts)
// já reescreve link.../<slug> para /r/<slug>, então lá o slug fica na raiz e
// dispensa o /r.
export async function shortLinkBase(): Promise<string> {
  const configured = process.env.NEXT_PUBLIC_SHORT_LINK_BASE?.trim().replace(/\/+$/, "");
  if (configured) return configured;

  const h = await headers();
  const host = h.get("host") ?? "";
  if (!host) return "/r";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}/r`;
}

export function shortLinkFor(base: string, slug: string): string {
  return `${base}/${slug}`;
}
