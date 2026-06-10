import type { NextConfig } from "next";

// STATIC_EXPORT=1 gera o site estático da demo (GitHub Pages).
// Nesse modo as rotas de API não existem; o workflow de deploy as remove antes do build.
const staticExport = process.env.STATIC_EXPORT === "1";

const nextConfig: NextConfig = staticExport
  ? {
      output: "export",
      basePath: "/canaldoanfitriao-dashboard",
      images: { unoptimized: true },
    }
  : {};

export default nextConfig;
