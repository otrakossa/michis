import { cn } from "@/lib/cn";

export function SignalChip({
  senal,
}: {
  senal: { tipo: string; descripcion: string; peso: number };
}) {
  const dots = "●".repeat(senal.peso) + "○".repeat(5 - senal.peso);
  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-xl border border-stone-700 bg-stone-800/60 px-3 py-2 text-sm",
      )}
    >
      <span className="font-mono text-[10px] tracking-tighter text-amber-400">{dots}</span>
      <span className="text-stone-200/90">{senal.descripcion}</span>
    </div>
  );
}
