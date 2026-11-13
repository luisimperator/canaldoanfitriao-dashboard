import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // O binário do ffmpeg (transcrição refeita pela gravação da call) roda fora
  // do bundle e precisa ir junto da função do /api/sync/calls.
  serverExternalPackages: ["ffmpeg-static"],
  outputFileTracingIncludes: {
    "/api/sync/calls": ["./node_modules/ffmpeg-static/ffmpeg"],
  },
  // Deck do A5E: público, servido pelo projeto Vercel deck-a5e (atualiza
  // sozinho quando publicam lá).
  async rewrites() {
    return [
      { source: "/deck", destination: "https://deck-a5e.vercel.app/" },
      { source: "/deck/:path*", destination: "https://deck-a5e.vercel.app/:path*" },
    ];
  },
};

export default nextConfig;
