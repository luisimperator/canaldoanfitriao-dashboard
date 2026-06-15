"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

type UploadResult =
  | { state: "idle" }
  | { state: "sending" }
  | { state: "ok"; message: string }
  | { state: "error"; message: string };

export function UploadExtrato() {
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const [result, setResult] = useState<UploadResult>({ state: "idle" });

  async function handleUpload(file: File) {
    setResult({ state: "sending" });
    const body = new FormData();
    body.append("file", file);
    try {
      const res = await fetch("/api/financeiro/upload", { method: "POST", body });
      const json = await res.json();
      if (!res.ok) {
        setResult({ state: "error", message: json.error ?? "Falha ao processar o arquivo." });
        return;
      }
      setResult({
        state: "ok",
        message: json.persisted
          ? `${json.count} lançamentos importados com sucesso.`
          : `${json.count} lançamentos lidos (prévia — banco de dados ainda não conectado).`,
      });
      router.refresh();
    } catch {
      setResult({ state: "error", message: "Erro de rede ao enviar o arquivo." });
    }
  }

  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        accept=".ofx,.csv"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleUpload(file);
          e.target.value = "";
        }}
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={result.state === "sending"}
        className="rounded-lg bg-slate-900 text-white text-sm font-medium px-4 py-2 hover:bg-slate-700 disabled:opacity-50"
      >
        {result.state === "sending" ? "Enviando…" : "Enviar extrato (OFX ou CSV)"}
      </button>
      {result.state === "ok" && (
        <p className="text-sm text-emerald-600 mt-2">{result.message}</p>
      )}
      {result.state === "error" && (
        <p className="text-sm text-rose-600 mt-2">{result.message}</p>
      )}
      <p className="text-xs text-slate-400 mt-2">
        Baixe o extrato OFX no Internet Banking do Inter. Lançamentos repetidos são ignorados
        automaticamente. Quando a integração direta com o Inter estiver ativa, este passo deixa
        de ser necessário.
      </p>
    </div>
  );
}
