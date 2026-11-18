import type { Lead } from "@/lib/types";
import { CHANNEL_COLOR, CHANNEL_ORDER } from "@/lib/channels";
import { canalDoLead, entrouPeloWhatsapp, hasUtm } from "@/lib/origin";
import { Card } from "@/components/ui";
import { SourcePie } from "@/components/charts";
import { CoberturaOrigem } from "@/components/CoberturaOrigem";

// Origem dos leads pelo canal das UTMs (mesma classificação da página Origem).
// O campo leads.source não serve: o sync do Mailchimp deixa todo mundo como
// "outro". Quem entrou direto pelo WhatsApp (sem formulário) tem fatia própria.
// Embaixo, o % de leads com origem rastreada — fica vermelho quando cai
// abaixo do mínimo, pra um formulário que parou de gravar UTM não passar batido.
export function OrigemLeadsCard({ leads, title }: { leads: Lead[]; title: string }) {
  const porCanal = new Map<string, number>();
  for (const l of leads) {
    const ch = canalDoLead(l);
    porCanal.set(ch, (porCanal.get(ch) ?? 0) + 1);
  }
  const data = CHANNEL_ORDER.filter((ch) => porCanal.has(ch)).map((ch) => ({
    name: ch,
    value: porCanal.get(ch) ?? 0,
    color: CHANNEL_COLOR[ch],
  }));

  return (
    <Card title={title}>
      <SourcePie data={data} />
      <CoberturaOrigem
        rastreados={leads.filter(hasUtm).length}
        total={leads.length}
        whatsappDireto={leads.filter(entrouPeloWhatsapp).length}
      />
    </Card>
  );
}
