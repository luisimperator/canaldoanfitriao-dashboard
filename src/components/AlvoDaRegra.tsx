"use client";

// Mostra o que salvar vai fazer com a base de treinamento: atualizar uma regra
// que já existe (com o texto de antes, pra comparar) ou criar uma nova.
//
// A IA prefere editar a regra que já cobre o assunto em vez de empilhar outra
// — foi o empilhamento que levou a base a 49 regras contraditórias. O botão
// "salvar como nova" fica como escape quando ela escolheu a regra errada.

export function AlvoDaRegra({
  acao,
  anterior,
  motivo,
  onSalvarComoNova,
}: {
  acao: "editar" | "nova";
  anterior?: { titulo: string; conteudo: string };
  motivo?: string;
  onSalvarComoNova?: () => void;
}) {
  if (acao === "nova") {
    return (
      <div className="rounded-lg border border-slate-200 dark:border-white/10 bg-white/60 dark:bg-white/[0.03] px-2.5 py-1.5 text-[11px] text-slate-600 dark:text-zinc-400">
        <span className="font-semibold text-slate-700 dark:text-zinc-300">Regra nova.</span>{" "}
        {motivo ?? "Nenhuma regra existente trata desse assunto."}
      </div>
    );
  }
  return (
    <div className="rounded-lg border border-violet-300 dark:border-violet-500/30 bg-violet-50 dark:bg-violet-500/10 px-2.5 py-1.5 text-[11px] text-violet-800 dark:text-violet-200">
      <p>
        <span className="font-semibold">Vai atualizar a regra existente</span>
        {anterior ? <> &ldquo;{anterior.titulo}&rdquo;</> : null}, em vez de criar outra.
        {motivo ? <> {motivo}</> : null}
      </p>
      {anterior && (
        <details className="mt-1">
          <summary className="cursor-pointer select-none font-medium">ver o texto de antes</summary>
          <p className="mt-1 whitespace-pre-wrap text-violet-700/90 dark:text-violet-300/80">
            {anterior.conteudo}
          </p>
        </details>
      )}
      {onSalvarComoNova && (
        <button onClick={onSalvarComoNova} className="mt-1 font-semibold underline">
          não, salvar como regra nova
        </button>
      )}
    </div>
  );
}
