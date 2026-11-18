import Link from "next/link";
import { num } from "@/lib/format";

// Abaixo disso a origem dos leads deixa de ser confiável (alarme de cobertura).
const COBERTURA_MINIMA = 60;

// % dos leads com origem rastreada, contado só entre quem passou por
// formulário. Quem entrou direto pelo WhatsApp nunca traz UTM: fica fora da
// conta, senão o alarme acende em todo dia de muito contato direto (Fernando,
// 18/11: "0% dos leads com origem rastreada"). O vermelho continua pra
// formulário que parou de gravar UTM.
export function CoberturaOrigem({
  rastreados,
  total,
  whatsappDireto,
}: {
  rastreados: number;
  total: number;
  whatsappDireto: number;
}) {
  if (total <= 0) return null;
  const base = total - whatsappDireto;
  const cobertura = base > 0 ? (rastreados / base) * 100 : null;
  const baixa = cobertura !== null && cobertura < COBERTURA_MINIMA;
  const um = whatsappDireto === 1;
  return (
    <p
      className={`text-xs mt-2 ${
        baixa ? "text-rose-600 dark:text-rose-400 font-semibold" : "text-slate-400 dark:text-zinc-500"
      }`}
    >
      {cobertura !== null && (
        <>
          {baixa ? "⚠ " : ""}
          {num(cobertura, 1)}% dos leads com origem rastreada ({num(rastreados)} de {num(base)}).{" "}
        </>
      )}
      {whatsappDireto > 0 && (
        <span className="font-normal text-slate-400 dark:text-zinc-500">
          {num(whatsappDireto)} {um ? "entrou" : "entraram"} direto pelo WhatsApp, sem formulário, e{" "}
          {um ? "fica" : "ficam"} fora dessa conta.{" "}
        </span>
      )}
      <Link href="/origem" className="underline">
        Ver origem detalhada
      </Link>
    </p>
  );
}
