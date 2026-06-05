export interface VerdictData {
  score?: number;
  confianza?: string;
  senales?: { tipo: string; descripcion: string; peso: number }[];
  cuentas_vinculadas?: { handle: string; relacion: string; razon: string }[];
  modo_degradado?: boolean;
  parcial?: boolean;
  stub?: boolean;
  summary?: string;
}

export function VerdictView({ verdict }: { verdict: VerdictData }) {
  if (verdict.stub || verdict.score == null) {
    return <p className="text-neutral-500">Sin veredicto del agente todavía.</p>;
  }
  const color =
    verdict.score > 70 ? "text-red-400" : verdict.score >= 40 ? "text-amber-400" : "text-emerald-400";

  return (
    <div className="flex flex-col gap-3 rounded border border-neutral-800 p-4">
      <div className="flex items-center gap-4">
        <span className={`text-4xl font-bold ${color}`}>{verdict.score}</span>
        <div className="text-sm text-neutral-400">
          <p>probabilidad de cuenta sintética</p>
          <p>confianza: {verdict.confianza}</p>
        </div>
        <div className="ml-auto flex gap-2 text-xs">
          {verdict.modo_degradado && (
            <span className="rounded bg-amber-950 px-2 py-1 text-amber-400">modo degradado</span>
          )}
          {verdict.parcial && (
            <span className="rounded bg-red-950 px-2 py-1 text-red-400">parcial</span>
          )}
        </div>
      </div>

      {(verdict.senales ?? []).length > 0 && (
        <table className="text-sm">
          <thead>
            <tr className="text-left text-neutral-500">
              <th className="pr-4">Señal</th><th className="pr-4">Descripción</th><th>Peso</th>
            </tr>
          </thead>
          <tbody>
            {verdict.senales!.map((s, i) => (
              <tr key={i} className="border-t border-neutral-800">
                <td className="pr-4 font-mono">{s.tipo}</td>
                <td className="pr-4 text-neutral-300">{s.descripcion}</td>
                <td>{s.peso}/5</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {(verdict.cuentas_vinculadas ?? []).length > 0 && (
        <div className="text-sm">
          <h3 className="mb-1 text-neutral-500">Cuentas posiblemente vinculadas</h3>
          <ul className="flex flex-col gap-1">
            {verdict.cuentas_vinculadas!.map((c, i) => (
              <li key={i}>
                <span className="font-mono">@{c.handle}</span>
                <span className="text-neutral-400"> · {c.relacion} · {c.razon}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
