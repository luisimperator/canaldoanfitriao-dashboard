"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// Seletor de época (atalhos de janela) via parâmetro na URL. Reutilizável em
// qualquer página server-rendered: a página lê o parâmetro e filtra os dados.
export function PeriodSelect({
  options,
  current,
  param = "meses",
}: {
  options: { value: string; label: string }[];
  current: string;
  param?: string;
}) {
  const pathname = usePathname();
  return (
    <div className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5">
      {options.map((o) => {
        const active = o.value === current;
        return (
          <Link
            key={o.value}
            href={`${pathname}?${param}=${o.value}`}
            scroll={false}
            className={`rounded-md px-2.5 py-1 text-xs font-semibold transition-colors ${
              active ? "bg-slate-900 text-white" : "text-slate-500 hover:text-slate-800"
            }`}
          >
            {o.label}
          </Link>
        );
      })}
    </div>
  );
}
