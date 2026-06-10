// Registro das integrações do dashboard e seu status de configuração.
// Cada integração é ativada por variáveis de ambiente (ver .env.example).

export interface IntegrationInfo {
  id: string;
  name: string;
  role: string;
  envVars: string[];
  configured: boolean;
  howItWorks: string;
}

const has = (...vars: string[]) => vars.every((v) => Boolean(process.env[v]));

export function listIntegrations(): IntegrationInfo[] {
  return [
    {
      id: "supabase",
      name: "Supabase (banco de dados)",
      role: "Armazena leads, vendas, gastos de tráfego e financeiro",
      envVars: ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY"],
      configured: has("NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY"),
      howItWorks:
        "Aplique supabase/migrations/0001_schema.sql em um projeto Supabase e preencha as variáveis. Sem isso o dashboard roda em modo demonstração.",
    },
    {
      id: "eduzz",
      name: "Eduzz (vendas)",
      role: "Registra cada venda automaticamente",
      envVars: ["EDUZZ_WEBHOOK_KEY"],
      configured: has("EDUZZ_WEBHOOK_KEY"),
      howItWorks:
        "Cadastre o webhook https://SEU_DOMINIO/api/webhooks/eduzz no painel da Eduzz (evento de fatura paga). Cada venda paga vira uma linha em `sales`.",
    },
    {
      id: "meta_ads",
      name: "Meta Ads (tráfego)",
      role: "Importa o investimento diário em anúncios",
      envVars: ["META_ADS_ACCESS_TOKEN", "META_ADS_ACCOUNT_ID"],
      configured: has("META_ADS_ACCESS_TOKEN", "META_ADS_ACCOUNT_ID"),
      howItWorks:
        "Gere um token de sistema no Business Manager com permissão ads_read. O endpoint POST /api/sync/meta-ads busca o gasto diário dos últimos 30 dias na Graph API (insights).",
    },
    {
      id: "mailchimp",
      name: "Mailchimp (captação)",
      role: "Importa novos inscritos como leads",
      envVars: ["MAILCHIMP_API_KEY", "MAILCHIMP_LIST_ID"],
      configured: has("MAILCHIMP_API_KEY", "MAILCHIMP_LIST_ID"),
      howItWorks:
        "Crie uma API key no Mailchimp. O endpoint POST /api/sync/mailchimp importa membros novos da lista como leads (status inicial: frio).",
    },
    {
      id: "unnichat",
      name: "Unnichat (CRM / atendimento)",
      role: "Atualiza o status do lead no funil (frio, lista de espera, quente, vendedor)",
      envVars: ["UNNICHAT_API_TOKEN"],
      configured: has("UNNICHAT_API_TOKEN"),
      howItWorks:
        "Configure um webhook/automação no Unnichat apontando para /api/webhooks/unnichat quando o lead mudar de etiqueta/funil. O payload esperado está documentado na própria rota.",
    },
    {
      id: "inter",
      name: "Banco Inter (financeiro)",
      role: "Importa o extrato da conta PJ automaticamente",
      envVars: ["INTER_CLIENT_ID", "INTER_CLIENT_SECRET", "INTER_CERT_PEM", "INTER_KEY_PEM"],
      configured: has("INTER_CLIENT_ID", "INTER_CLIENT_SECRET"),
      howItWorks:
        "Crie uma aplicação no Internet Banking PJ (menu Aplicações) com o escopo extrato.read e baixe o certificado mTLS. O endpoint POST /api/sync/inter consulta /banking/v2/extrato e grava em fin_transactions. Enquanto isso, dá para subir o extrato OFX/CSV manualmente na tela Financeiro.",
    },
  ];
}
