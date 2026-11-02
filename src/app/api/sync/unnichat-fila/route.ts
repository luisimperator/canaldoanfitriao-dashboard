import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { contatoDoAviso, processarEventoUnnichat, type Vendedor } from "@/lib/unnichat-evento";

// Fila dos avisos do Unnichat. O webhook (/api/webhooks/unnichat) só grava o
// aviso em webhook_log com pendente = true; esta rota, chamada pelo cron da
// Vercel a cada minuto, processa a fila em ritmo controlado:
//  - pega um lote com trava (pegar_fila_unnichat), em ordem de chegada;
//  - processa em poucas "pistas" em paralelo, sempre na ordem de cada contato
//    (o estado do lead termina igual ao do aviso mais novo);
//  - se um aviso falha, os seguintes do mesmo contato esperam a próxima rodada;
//  - tenta até 5 vezes; na última grava o evento mesmo que o lead falhe.

export const maxDuration = 60;

const LOTE = 300;
const PISTAS = 4;
const MAX_TENTATIVAS = 5;
const ORCAMENTO_MS = 45_000; // termina antes do próximo minuto do cron

interface Aviso {
  id: string;
  created_at: string;
  body: unknown;
  etapa: string | null;
  tentativas: number;
}

async function processarFila() {
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "Supabase não configurado." }, { status: 501 });

  const inicio = Date.now();
  const { data: lote, error } = await supabase.rpc("pegar_fila_unnichat", { p_limite: LOTE });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const avisos = ((lote ?? []) as Aviso[]).sort((a, b) => a.created_at.localeCompare(b.created_at));
  if (avisos.length === 0) return NextResponse.json({ ok: true, processados: 0 });

  const { data: vendedores } = await supabase.from("sellers").select("id, name");

  // Agrupa por contato, mantendo a ordem de chegada dentro de cada um.
  const porContato = new Map<string, Aviso[]>();
  for (const a of avisos) {
    const k = contatoDoAviso(a.body) || a.id;
    const lista = porContato.get(k);
    if (lista) lista.push(a);
    else porContato.set(k, [a]);
  }
  const grupos = [...porContato.values()];

  let processados = 0;
  let falhas = 0;
  let adiados = 0;

  async function liberar(ids: string[]) {
    // Devolve à fila sem esperar a trava de 2 min vencer.
    if (ids.length > 0) {
      await supabase!.from("webhook_log").update({ processando_ate: null }).in("id", ids);
    }
  }

  async function pista() {
    while (grupos.length > 0) {
      const grupo = grupos.shift()!;
      for (let i = 0; i < grupo.length; i++) {
        const a = grupo[i];
        if (Date.now() - inicio > ORCAMENTO_MS) {
          const resto = grupo.slice(i).map((x) => x.id);
          adiados += resto.length;
          await liberar(resto);
          break;
        }
        const tentativa = a.tentativas + 1;
        let r: Awaited<ReturnType<typeof processarEventoUnnichat>>;
        try {
          r = await processarEventoUnnichat(supabase!, a.body, {
            etapa: a.etapa,
            recebidoEm: a.created_at,
            vendedores: (vendedores ?? []) as Vendedor[],
            ultimaTentativa: tentativa >= MAX_TENTATIVAS,
          });
        } catch (e) {
          r = { ok: false, erro: e instanceof Error ? e.message : String(e) };
        }
        if (r.ok) {
          processados++;
          await supabase!
            .from("webhook_log")
            .update({ pendente: false, processado_em: new Date().toISOString(), erro: null, tentativas: tentativa, processando_ate: null })
            .eq("id", a.id);
        } else {
          falhas++;
          const desiste = tentativa >= MAX_TENTATIVAS;
          await supabase!
            .from("webhook_log")
            .update({
              tentativas: tentativa,
              erro: r.erro.slice(0, 500),
              pendente: !desiste,
              processado_em: desiste ? new Date().toISOString() : null,
            })
            .eq("id", a.id);
          // Os avisos seguintes do mesmo contato esperam, para não aplicar um
          // estado mais novo antes deste. A trava de 2 min dá o intervalo
          // até a próxima tentativa.
          if (!desiste) {
            adiados += grupo.length - i - 1;
            break;
          }
        }
      }
    }
  }

  await Promise.all(Array.from({ length: PISTAS }, () => pista()));

  const { count: restantes } = await supabase
    .from("webhook_log")
    .select("id", { count: "exact", head: true })
    .eq("source", "unnichat")
    .eq("pendente", true);

  return NextResponse.json({
    ok: true,
    processados,
    falhas,
    adiados,
    restantes: restantes ?? null,
    ms: Date.now() - inicio,
  });
}

// GET: cron da Vercel (vercel.json). POST: disparo manual, já logado.
// A autorização fica no proxy (src/proxy.ts) para todo /api/sync.
export async function GET() {
  return processarFila();
}

export async function POST() {
  return processarFila();
}
