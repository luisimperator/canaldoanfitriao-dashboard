import { PageHeader } from "@/components/ui";
import { TeoWhatsApp } from "@/components/TeoWhatsApp";

export const dynamic = "force-dynamic";

// WhatsApp do Téo: tudo o que o Téo está conversando, no visual do WhatsApp,
// atualizando sozinho (lista a cada 10 s, conversa aberta a cada 6 s).
export default function WhatsappTeoPage() {
  return (
    <div>
      <PageHeader title="WhatsApp do Téo" subtitle="As conversas do Téo, ao vivo" />
      <TeoWhatsApp />
    </div>
  );
}
