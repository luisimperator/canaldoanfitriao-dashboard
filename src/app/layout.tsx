import type { Metadata } from "next";
import { Geist } from "next/font/google";
import "./globals.css";
import { Sidebar } from "@/components/Sidebar";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Canal do Anfitrião — Dashboard",
  description: "Funil de vendas e financeiro do Canal do Anfitrião",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR" className={`${geistSans.variable} h-full antialiased`}>
      <body className="min-h-full">
        <div className="flex min-h-screen flex-col lg:flex-row">
          <Sidebar />
          <main className="w-full min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-10 lg:py-8 max-w-7xl">
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}
