import { NextResponse } from "next/server";

// Integração com a API do Banco Inter (conta PJ) — extrato automático.
//
// Como ativar:
// 1. No Internet Banking PJ do Inter, acesse Conta Digital > Aplicações e
//    crie uma aplicação com o escopo "extrato.read". Baixe o certificado
//    (.crt) e a chave (.key) — a API do Inter exige mTLS.
// 2. Preencha INTER_CLIENT_ID, INTER_CLIENT_SECRET, INTER_CERT_PEM e
//    INTER_KEY_PEM (conteúdo dos arquivos PEM) no ambiente.
// 3. Fluxo da chamada:
//    - POST https://cdpj.partners.bancointer.com.br/oauth/v2/token
//      (grant_type=client_credentials, scope=extrato.read, com mTLS)
//    - GET  https://cdpj.partners.bancointer.com.br/banking/v2/extrato
//      ?dataInicio=YYYY-MM-DD&dataFim=YYYY-MM-DD
//    - Gravar cada lançamento em fin_transactions (external_id evita duplicar).
//
// O fetch nativo do Next não suporta certificado de cliente (mTLS); essa rota
// precisa rodar com o runtime Node usando `undici` com um Agent customizado.
// Enquanto a credencial não sai, use o upload de extrato OFX/CSV na tela
// Financeiro — o resultado no banco é o mesmo.

export async function POST() {
  const configured = Boolean(
    process.env.INTER_CLIENT_ID &&
      process.env.INTER_CLIENT_SECRET &&
      process.env.INTER_CERT_PEM &&
      process.env.INTER_KEY_PEM
  );
  return NextResponse.json(
    {
      error: configured
        ? "Credenciais presentes, mas o cliente mTLS ainda não foi implementado nesta rota. Veja o passo a passo no código."
        : "Integração com o Banco Inter ainda não configurada. Use o upload de extrato OFX/CSV na tela Financeiro, ou configure as variáveis INTER_* (veja instruções no código desta rota).",
    },
    { status: 501 }
  );
}
