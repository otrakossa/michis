import { fraseVeredicto } from "@/lib/estados";
import { ScoreGauge } from "@/components/ScoreGauge";
import { SignalChip } from "@/components/SignalChip";

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
    return <p className="text-stone-400">Sin veredicto del agente todavía.</p>;
  }
  const score = verdict.score;

  return (
    <div className="card flex flex-col gap-6">
      {/* Cabecera: gauge + badges modo degradado/parcial */}
      <div className="flex flex-col items-center gap-2 sm:flex-row sm:items-start sm:gap-6">
        <ScoreGauge
          score={score}
          frase={fraseVeredicto(score)}
          confianza={verdict.confianza}
        />
        <div className="flex flex-col items-end gap-1 sm:ml-auto">
          {verdict.modo_degradado && (
            <span className="rounded-full bg-amber-950 px-2 py-0.5 text-xs text-orange-400">
              modo degradado
            </span>
          )}
          {verdict.parcial && (
            <span className="rounded-full bg-red-950 px-2 py-0.5 text-xs text-red-400">
              parcial
            </span>
          )}
        </div>
      </div>

      {/* Señales */}
      {(verdict.senales ?? []).length > 0 && (
        <div className="flex flex-col gap-2">
          {verdict.senales!.map((s, i) => (
            <SignalChip key={i} senal={s} />
          ))}
        </div>
      )}

      {/* Cuentas vinculadas */}
      {(verdict.cuentas_vinculadas ?? []).length > 0 && (
        <div className="text-sm">
          <h3 className="mb-1 text-stone-400">Cuentas posiblemente vinculadas</h3>
          <div className="flex flex-wrap gap-2">
            {verdict.cuentas_vinculadas!.map((c, i) => (
              <span key={i} className="chip font-mono">
                @{c.handle}{" "}
                <span className="font-sans text-stone-400">
                  · {c.relacion.replace(/_/g, " ")} · {c.razon}
                </span>
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
