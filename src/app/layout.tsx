import type { Metadata, Viewport } from "next";
import { Geist } from "next/font/google";
import "./globals.css";
import { Sidebar } from "@/components/Sidebar";
import { PwaRegister } from "@/components/PwaRegister";
import { getAccess } from "@/lib/supabase-server";
import { ADMIN_TAB, TABS } from "@/lib/access";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Canal do Anfitrião — Dashboard",
  description: "Funil de vendas e financeiro do Canal do Anfitrião",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Canal do Anfitrião",
  },
  icons: {
    icon: [
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180" }],
  },
};

export const viewport: Viewport = {
  themeColor: "#0f172a",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const access = await getAccess();
  const visibleTabs = TABS.filter((t) => access.isAdmin || access.tabs.includes(t.href));
  if (access.isAdmin) visibleTabs.push(ADMIN_TAB);

  return (
    <html lang="pt-BR" className={`${geistSans.variable} h-full antialiased`} suppressHydrationWarning>
      <head>
        {/* Aplica o tema ANTES da hidratação (sem flash): escolha salva > preferência do sistema. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var t=localStorage.getItem("theme");if(t==="dark"||(!t&&matchMedia("(prefers-color-scheme: dark)").matches))document.documentElement.classList.add("dark")}catch(e){}`,
          }}
        />
      </head>
      <body className="min-h-full">
        <PwaRegister />
        <div className="flex min-h-screen flex-col lg:flex-row">
          <Sidebar tabs={visibleTabs} email={access.authed ? access.email : null} />
          <main className="w-full min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-10 lg:py-8 max-w-7xl">
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}
