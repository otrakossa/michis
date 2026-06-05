import { fraseVeredicto } from "@/lib/estados";

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

function pesoDots(peso: number): string {
  const p = Math.max(0, Math.min(5, Math.round(peso)));
  return "●".repeat(p) + "○".repeat(5 - p);
}

export function VerdictView({ verdict }: { verdict: VerdictData }) {
  if (verdict.stub || verdict.score == null) {
    return <p className="text-stone-400">Sin veredicto del agente todavía.</p>;
  }
  const score = verdict.score;
  const color = score > 70 ? "#f87171" : score >= 40 ? "#f59e0b" : "#4ade80";

  return (
    <div className="card flex flex-col gap-4">
      <div className="flex items-center gap-4">
        <div
          className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full"
          style={{ background: `conic-gradient(${color} 0% ${score}%, #44403c ${score}% 100%)` }}
        >
          <div
            className="flex h-[52px] w-[52px] items-center justify-center rounded-full bg-stone-800 text-xl font-extrabold"
            style={{ color }}
          >
            {score}
          </div>
        </div>
        <div>
          <p className="font-bold">{fraseVeredicto(score)}</p>
          <p className="text-sm text-stone-400">confianza: {verdict.confianza}</p>
        </div>
        <div className="ml-auto flex flex-col items-end gap-1">
          {verdict.modo_degradado && (
            <span className="rounded-full bg-amber-950 px-2 py-0.5 text-xs text-orange-400">modo degradado</span>
          )}
          {verdict.parcial && (
            <span className="rounded-full bg-red-950 px-2 py-0.5 text-xs text-red-400">parcial</span>
          )}
        </div>
      </div>

      {(verdict.senales ?? []).length > 0 && (
        <div className="flex flex-wrap gap-2">
          {verdict.senales!.map((s, i) => (
            <span key={i} className="chip">
              {s.tipo.replace(/_/g, " ")} · {s.descripcion}{" "}
              <b style={{ color: s.peso >= 4 ? "#f87171" : "#fb923c" }}>{pesoDots(s.peso)}</b>
            </span>
          ))}
        </div>
      )}

      {(verdict.cuentas_vinculadas ?? []).length > 0 && (
        <div className="text-sm">
          <h3 className="mb-1 text-stone-400">Cuentas posiblemente vinculadas</h3>
          <div className="flex flex-wrap gap-2">
            {verdict.cuentas_vinculadas!.map((c, i) => (
              <span key={i} className="chip font-mono">
                @{c.handle} <span className="font-sans text-stone-400">· {c.relacion.replace(/_/g, " ")} · {c.razon}</span>
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
