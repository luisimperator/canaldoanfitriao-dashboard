"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";

// Gera o QR code LOCALMENTE (sem serviço externo). Renderiza um PNG e oferece
// download de verdade (data URL same-origin baixa direto, sem abrir aba).
export function QrCode({
  value,
  size = 112,
  filename = "qr.png",
  download = true,
}: {
  value: string;
  size?: number;
  filename?: string;
  download?: boolean;
}) {
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    let on = true;
    QRCode.toDataURL(value, { width: 512, margin: 1, errorCorrectionLevel: "M" })
      .then((d) => {
        if (on) setSrc(d);
      })
      .catch(() => {
        if (on) setSrc(null);
      });
    return () => {
      on = false;
    };
  }, [value]);

  return (
    <div className="flex flex-col items-center gap-1.5">
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt="QR code"
          style={{ width: size, height: size }}
          className="rounded-md border border-slate-100 dark:border-white/[0.06]"
        />
      ) : (
        <div
          style={{ width: size, height: size }}
          className="rounded-md border border-slate-100 dark:border-white/[0.06] bg-slate-50 dark:bg-white/[0.04]"
        />
      )}
      {download && src && (
        <a
          href={src}
          download={filename}
          className="rounded-md border border-slate-300 dark:border-white/15 px-2 py-0.5 text-[11px] font-semibold text-slate-700 dark:text-zinc-300 hover:bg-slate-50 dark:hover:bg-white/5"
        >
          Baixar QR
        </a>
      )}
    </div>
  );
}
