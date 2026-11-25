import { getSupabaseAdmin } from "@/lib/supabase-admin";

// Faixa de alerta nas telas de custo quando uma importação parou (migração
// 0150, alertas_integracoes): mais de 9 h sem leitura boa do gasto da Meta,
// das faturas ou do custo do WhatsApp. O mesmo alerta vai pro celular pela
// rota /api/sync/alertas.

interface Alerta {
  chave: string;
  titulo: string;
  ok_em: string | null;
  horas: number;
  erro: string | null;
  token: boolean;
}

function quando(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export async function AlertasIntegracao({ chaves }: { chaves: string[] }) {
  const supabase = getSupabaseAdmin();
  if (!supabase) return null;
  const { data } = await supabase.rpc("alertas_integracoes");
  const alertas = ((data ?? []) as Alerta[]).filter((a) => chaves.includes(a.chave));
  if (alertas.length === 0) return null;
  return (
    <div className="mb-4 space-y-1 rounded-[16px] border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-800 dark:text-rose-300">
      {alertas.map((a) => (
        <p key={a.chave}>
          <strong>⚠ {a.titulo}.</strong>{" "}
          {a.ok_em ? `Última leitura boa em ${quando(a.ok_em)} (há ${a.horas} h).` : "Nenhuma leitura boa nos últimos 30 dias."}{" "}
          {a.token
            ? "O token de acesso da Meta expirou: gere um novo e troque no Vault. Até lá, os números desta tela estão parados."
            : a.erro
              ? `Último erro: ${a.erro}`
              : ""}
        </p>
      ))}
    </div>
  );
}
