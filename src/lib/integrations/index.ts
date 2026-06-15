// Registro das integrações do dashboard e seu status de configuração.
// Cada integração é ativada por variáveis de ambiente (ver .env.example).

export interface IntegrationInfo {
  id: string;
  name: string;
  role: string;
  envVars: string[];
  configured: boolean;
  howItWorks: string;
  /** rota POST de sincronização manual, quando existir */
  syncPath?: string;
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
      id: "tmb",
      name: "TMB (pagamentos pix / boleto parcelado)",
      role: "Pagamentos previstos e inadimplentes",
      envVars: ["TMB_WEBHOOK_KEY"],
      configured: has("TMB_WEBHOOK_KEY"),
      howItWorks:
        "Cadastre o webhook https://SEU_DOMINIO/api/webhooks/tmb?key=TMB_WEBHOOK_KEY no painel da TMB. Por enquanto o endpoint registra todo evento recebido (webhook_log) para mapearmos o formato real; depois construímos a visão de pagamentos previstos e inadimplência.",
    },
    {
      id: "meta_ads",
      name: "Meta Ads (tráfego)",
      role: "Importa o investimento diário em anúncios",
      envVars: ["META_ADS_ACCESS_TOKEN", "META_ADS_ACCOUNT_ID"],
      configured: has("META_ADS_ACCESS_TOKEN", "META_ADS_ACCOUNT_ID"),
      syncPath: "/api/sync/meta-ads",
      howItWorks:
        "Conectada via token de System User (não expira) com ads_read. O gasto diário dos últimos 30 dias é importado automaticamente direto no Supabase a cada 3h (sem precisar de variável no Vercel nem do botão).",
    },
    {
      id: "mailchimp",
      name: "Mailchimp (captação)",
      role: "Importa novos inscritos como leads",
      envVars: ["MAILCHIMP_API_KEY", "MAILCHIMP_LIST_ID"],
      configured: has("MAILCHIMP_API_KEY", "MAILCHIMP_LIST_ID"),
      syncPath: "/api/sync/mailchimp",
      howItWorks:
        "Crie uma API key no Mailchimp. O endpoint POST /api/sync/mailchimp importa membros novos da lista como leads (status inicial: frio).",
    },
    {
      id: "unnichat",
      name: "Unnichat (CRM / atendimento)",
      role: "Atualiza o status do lead no funil (frio, lista de espera, quente, vendedor)",
      envVars: ["UNNICHAT_WEBHOOK_KEY"],
      configured: has("UNNICHAT_WEBHOOK_KEY"),
      howItWorks:
        "Configure um webhook/automação no Unnichat apontando para /api/webhooks/unnichat quando o lead mudar de etiqueta/funil. O payload esperado está documentado na própria rota.",
    },
    {
      id: "inter",
      name: "Banco Inter (financeiro)",
      role: "Importa o extrato da conta PJ automaticamente",
      envVars: ["INTER_CLIENT_ID", "INTER_CLIENT_SECRET", "INTER_CERT_PEM", "INTER_KEY_PEM"],
      configured: has("INTER_CLIENT_ID", "INTER_CLIENT_SECRET"),
      syncPath: "/api/sync/inter",
      howItWorks:
        "Crie uma aplicação no Internet Banking PJ (menu Aplicações) com o escopo extrato.read e baixe o certificado mTLS. O endpoint POST /api/sync/inter consulta /banking/v2/extrato e grava em fin_transactions. Enquanto isso, dá para subir o extrato OFX/CSV manualmente na tela Financeiro.",
    },
  ];
}
