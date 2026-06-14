// Esqueleto exibido instantaneamente ao navegar entre as abas, enquanto o
// servidor renderiza a página. Dá retorno imediato ao clique (o usuário vê na
// hora que a navegação foi registrada) em vez de uma tela parada.
export default function Loading() {
  return (
    <div className="animate-pulse" aria-busy="true" aria-label="Carregando">
      {/* Cabeçalho */}
      <div className="mb-6">
        <div className="h-7 w-56 rounded bg-slate-200" />
        <div className="mt-2 h-4 w-80 max-w-full rounded bg-slate-100" />
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4 mb-6">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="h-3 w-20 rounded bg-slate-100" />
            <div className="mt-3 h-6 w-24 rounded bg-slate-200" />
          </div>
        ))}
      </div>

      {/* Blocos de gráfico/tabela */}
      <div className="grid lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 rounded-xl border border-slate-200 bg-white p-4">
          <div className="h-4 w-40 rounded bg-slate-100" />
          <div className="mt-4 h-56 rounded-lg bg-slate-100" />
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="h-4 w-32 rounded bg-slate-100" />
          <div className="mt-4 h-56 rounded-lg bg-slate-100" />
        </div>
      </div>
    </div>
  );
}
