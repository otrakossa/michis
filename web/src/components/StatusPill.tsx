import { Loader2, Clock, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/cn";
import { ESTADO_CASO, ESTADO_DOSSIER, ESTADO_RUN, etiquetaEstado } from "@/lib/estados";

const MAPA: Record<"caso" | "dossier" | "run", Record<string, string>> = {
  caso: ESTADO_CASO,
  dossier: ESTADO_DOSSIER,
  run: ESTADO_RUN,
};

function iconForEstado(
  mapa: "caso" | "dossier" | "run",
  estado: string,
): React.ElementType | null {
  if (mapa === "caso") {
    if (estado === "investigando") return Loader2;
    if (estado === "confirmado") return CheckCircle2;
  }
  if (mapa === "dossier") {
    if (estado === "listo_admin") return Clock;
    if (estado === "approved") return CheckCircle2;
  }
  if (mapa === "run") {
    if (estado === "running") return Loader2;
    if (estado === "done") return CheckCircle2;
  }
  return null;
}

function clsForEstado(mapa: "caso" | "dossier" | "run", estado: string): string {
  if (mapa === "caso") {
    if (estado === "investigando") return "bg-orange-400/15 text-orange-400";
    if (estado === "needs_review") return "bg-amber-500/15 text-amber-400";
    if (estado === "confirmado") return "bg-green-400/15 text-green-400";
    if (estado === "descartado") return "bg-stone-700/40 text-stone-400";
  }
  if (mapa === "dossier") {
    if (estado === "listo_admin") return "bg-orange-400/15 text-orange-400";
    if (estado === "approved") return "bg-green-400/15 text-green-400";
  }
  if (mapa === "run") {
    if (estado === "running") return "bg-amber-500/15 text-amber-400";
    if (estado === "done") return "bg-green-400/15 text-green-400";
    if (estado === "failed") return "bg-red-400/15 text-red-400";
  }
  return "bg-stone-700/40 text-stone-400";
}

export function StatusPill({
  mapa,
  estado,
}: {
  mapa: "caso" | "dossier" | "run";
  estado: string;
}) {
  const Icon = iconForEstado(mapa, estado);
  const cls = clsForEstado(mapa, estado);
  const spinning = (mapa === "caso" && estado === "investigando") || (mapa === "run" && estado === "running");
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold",
        cls,
      )}
    >
      {Icon && <Icon className={cn("size-3", spinning && "animate-spin")} />}
      {etiquetaEstado(MAPA[mapa], estado)}
    </span>
  );
}
