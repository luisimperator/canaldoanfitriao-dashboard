// Ferramenta da Lia: "quando é a minha imersão?" (Fernando, 21/11: "ela tem que
// olhar no Eduzz quando a pessoa comprou e falar: olha, a sua imersão é de tal").
//
// Acha a compra da Imersão Chuva de Reservas (imersao_compradores, que vem da
// Eduzz) pelo telefone da conversa, e-mail ou nome, e devolve a turma de cada
// compra com os horários do cadastro da turma (imersao_turmas), a hora em que a
// sala abre e o que está acontecendo agora. O horário muda de semana pra semana
// (ex.: 21/11 começou às 10h), então a resposta sai sempre do banco.

import type { SupabaseClient } from "@supabase/supabase-js";
import { turmaParaCompra } from "@/lib/imersao";
import { diaHumano, horaHumana } from "@/lib/imersao-pagina";

const LINK = "https://link.canaldoanfitriao.com.br/imersao";
const ABRE_ANTES_MS = 30 * 60 * 1000; // igual ao /imersao

type TurmaRow = {
  turma_data: string;
  inicio_sabado: string;
  fim_sabado: string;
  inicio_domingo: string;
  fim_domingo: string;
  sala_abre_sabado: string | null;
  sala_abre_domingo: string | null;
  codigo: string | null;
};

function descreverTurma(t: TurmaRow, agora: number) {
  const ms = (iso: string) => new Date(iso).getTime();
  const abreSab = t.sala_abre_sabado ? ms(t.sala_abre_sabado) : ms(t.inicio_sabado) - ABRE_ANTES_MS;
  const abreDom = t.sala_abre_domingo ? ms(t.sala_abre_domingo) : ms(t.inicio_domingo) - ABRE_ANTES_MS;
  const dia = (inicio: string, fim: string, abre: number) =>
    `${diaHumano(inicio)}, das ${horaHumana(inicio)} às ${horaHumana(fim)} (a sala abre às ${horaHumana(abre)})`;
  let agoraTexto: string;
  if (agora < abreSab) agoraTexto = `ainda não começou: o 1º dia é ${diaHumano(t.inicio_sabado)}, a sala abre às ${horaHumana(abreSab)}`;
  else if (agora <= ms(t.fim_sabado)) agoraTexto = "o 1º dia está acontecendo AGORA: é só entrar pelo link";
  else if (agora < abreDom) agoraTexto = `o 1º dia já foi; o 2º é ${diaHumano(t.inicio_domingo)}, a sala abre às ${horaHumana(abreDom)}`;
  else if (agora <= ms(t.fim_domingo)) agoraTexto = "o 2º dia está acontecendo AGORA: é só entrar pelo link";
  else agoraTexto = "essa turma já aconteceu";
  return {
    turma: t.turma_data,
    // Turma com codigo tem link próprio (/i/<codigo>); as antigas usam o /imersao.
    link: t.codigo ? `https://link.canaldoanfitriao.com.br/i/${t.codigo}` : LINK,
    sabado: dia(t.inicio_sabado, t.fim_sabado, abreSab),
    domingo: dia(t.inicio_domingo, t.fim_domingo, abreDom),
    agora: agoraTexto,
  };
}

export async function consultarImersao(
  admin: SupabaseClient,
  input: { email?: string; telefone?: string; nome?: string },
  telefoneConversa?: string | null
): Promise<string> {
  const email = (input.email ?? "").trim().toLowerCase();
  const tel = String(input.telefone || telefoneConversa || "").replace(/\D/g, "");
  const nome = (input.nome ?? "").replace(/[%,()"]/g, " ").trim();
  const filtros: string[] = [];
  if (email.includes("@")) filtros.push(`email.ilike.${email}`);
  if (tel.length >= 8) filtros.push(`telefone.ilike.%${tel.slice(-8)}`);
  if (!filtros.length && nome.length >= 5) filtros.push(`nome.ilike.%${nome}%`);

  type Compra = { nome: string | null; email: string | null; turma_data: string | null; pago_em: string | null; status: string | null };
  let compras: Compra[] = [];
  if (filtros.length) {
    const { data, error } = await admin
      .from("imersao_compradores")
      .select("nome, email, turma_data, pago_em, status")
      .or(filtros.join(","))
      .order("pago_em", { ascending: false, nullsFirst: false })
      .limit(5);
    if (error) return JSON.stringify({ erro: error.message });
    compras = (data ?? []) as Compra[];
  }

  const agora = Date.now();
  const proxima = turmaParaCompra(new Date(agora));
  const datas = [...new Set([...compras.map((c) => c.turma_data).filter(Boolean), proxima])] as string[];
  const { data: turmas } = await admin
    .from("imersao_turmas")
    .select("turma_data, inicio_sabado, fim_sabado, inicio_domingo, fim_domingo, sala_abre_sabado, sala_abre_domingo, codigo")
    .in("turma_data", datas);
  const porData = new Map(((turmas ?? []) as TurmaRow[]).map((t) => [t.turma_data, t]));
  const turmaInfo = (d: string | null) => {
    const t = d ? porData.get(d) : undefined;
    return t ? descreverTurma(t, agora) : { turma: d, aviso: "turma sem horário cadastrado no painel: confirme com o time (create_handoff)" };
  };

  if (!compras.length) {
    return JSON.stringify({
      achou_compra: false,
      buscou_por: { email: email || null, telefone_final: tel ? tel.slice(-4) : null, nome: filtros.length ? null : nome || null },
      dica: "Peça o e-mail usado na compra e consulte de novo. Quem compra agora entra na turma abaixo.",
      proxima_turma_a_venda: turmaInfo(proxima),
    });
  }
  return JSON.stringify({
    achou_compra: true,
    regra: "mande o link da turma da pessoa (campo link de cada compra)",
    compras: compras.map((c) => ({
      nome: c.nome,
      email: c.email,
      status: c.status,
      comprou_em: c.pago_em
        ? new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(c.pago_em))
        : null,
      ...turmaInfo(c.turma_data),
    })),
  });
}
