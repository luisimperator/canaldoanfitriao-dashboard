import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // O binário do ffmpeg (transcrição refeita pela gravação da call) roda fora
  // do bundle e precisa ir junto da função do /api/sync/calls.
  serverExternalPackages: ["ffmpeg-static"],
  outputFileTracingIncludes: {
    "/api/sync/calls": ["./node_modules/ffmpeg-static/ffmpeg"],
  },
};

export default nextConfig;
