import type { Metadata } from "next";

// App "Agenda" (Fernando, 18/11: "o ícone rosa que eu queria mudar"): no iPhone
// o aviso mostra sempre o ícone do app que assinou, então a call ganha um app
// próprio, de ícone azul, instalado a partir desta página. Os campos abaixo
// substituem os do layout raiz só aqui (o merge do metadata é raso).
export const metadata: Metadata = {
  title: "Agenda — Canal do Anfitrião",
  manifest: "/agenda.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Agenda",
  },
  icons: {
    icon: [
      { url: "/icon-agenda-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-agenda-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/apple-touch-icon-agenda.png", sizes: "180x180" }],
  },
};

export default function AgendaLayout({ children }: { children: React.ReactNode }) {
  return children;
}
