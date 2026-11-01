import Link from "next/link";
import type { Lead } from "@/lib/types";
import { CHANNEL_COLOR, CHANNEL_ORDER, classifyChannel } from "@/lib/channels";
import { hasUtm } from "@/lib/origin";
import { num } from "@/lib/format";
import { Card } from "@/components/ui";
import { SourcePie } from "@/components/charts";

// Abaixo disso a origem dos leads deixa de ser confiável (alarme de cobertura).
const COBERTURA_MINIMA = 60;

// Origem dos leads pelo canal das UTMs (mesma classificação da página Origem).
// O campo leads.source não serve: o sync do Mailchimp deixa todo mundo como
// "outro". Embaixo, o % de leads com origem rastreada — fica vermelho quando cai
// abaixo do mínimo, pra um formulário que parou de gravar UTM não passar batido.
export function OrigemLeadsCard({ leads, title }: { leads: Lead[]; title: string }) {
  const porCanal = new Map<string, number>();
  for (const l of leads) {
    const ch = classifyChannel(l.utm);
    porCanal.set(ch, (porCanal.get(ch) ?? 0) + 1);
  }
  const data = CHANNEL_ORDER.filter((ch) => porCanal.has(ch)).map((ch) => ({
    name: ch,
    value: porCanal.get(ch) ?? 0,
    color: CHANNEL_COLOR[ch],
  }));
  const rastreados = leads.filter(hasUtm).length;
  const cobertura = leads.length > 0 ? (rastreados / leads.length) * 100 : null;
  const baixa = cobertura !== null && cobertura < COBERTURA_MINIMA;

  return (
    <Card title={title}>
      <SourcePie data={data} />
      {cobertura !== null && (
        <p
          className={`text-xs mt-2 ${
            baixa ? "text-rose-600 dark:text-rose-400 font-semibold" : "text-slate-400 dark:text-zinc-500"
          }`}
        >
          {baixa ? "⚠ " : ""}
          {num(cobertura, 1)}% dos leads com origem rastreada ({num(rastreados)} de{" "}
          {num(leads.length)}).{" "}
          <Link href="/origem" className="underline">
            Ver origem detalhada
          </Link>
        </p>
      )}
    </Card>
  );
}
