// Portado de michis-alerta/src/components/michis/ui.tsx líneas 132-179
// Adaptaciones: colores hex explícitos #f87171/#f59e0b/#4ade80; confianza TEXTUAL (string, no number)

export function ScoreGauge({
  score,
  frase,
  confianza,
}: {
  score: number;
  frase?: string;
  confianza?: string;
}) {
  const color =
    score > 70 ? "#f87171" : score >= 40 ? "#f59e0b" : "#4ade80";
  const radius = 78;
  const circ = 2 * Math.PI * radius;
  const offset = circ - (score / 100) * circ;

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="relative size-48">
        <svg viewBox="0 0 200 200" className="size-full -rotate-90">
          <circle
            cx="100"
            cy="100"
            r={radius}
            stroke="#44403c"
            strokeWidth="12"
            fill="none"
          />
          <circle
            cx="100"
            cy="100"
            r={radius}
            stroke={color}
            strokeWidth="12"
            fill="none"
            strokeLinecap="round"
            strokeDasharray={circ}
            strokeDashoffset={offset}
            style={{
              transition: "stroke-dashoffset 1100ms cubic-bezier(0.22, 1, 0.36, 1)",
            }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span
            className="font-mono text-5xl font-extrabold"
            style={{ color }}
          >
            {score}
          </span>
          <span className="text-[10px] uppercase tracking-widest text-stone-400">
            riesgo / 100
          </span>
        </div>
      </div>
      {frase && (
        <p className="max-w-xs text-balance text-center text-base font-semibold leading-snug">
          {frase}
        </p>
      )}
      {confianza != null && (
        <span className="rounded-full border border-stone-700 bg-stone-800 px-3 py-1 text-xs text-stone-400">
          confianza de la IA:{" "}
          <span className="font-mono font-bold text-stone-100">{confianza}</span>
        </span>
      )}
    </div>
  );
}
