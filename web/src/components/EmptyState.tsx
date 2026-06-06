import { cn } from "@/lib/cn";

export function EmptyState({
  emoji,
  titulo,
  texto,
  action,
}: {
  emoji: string;
  titulo: string;
  texto: string;
  action?: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center gap-3 rounded-2xl border border-dashed border-stone-700 bg-stone-800/40 px-6 py-12 text-center",
      )}
    >
      <div className="text-5xl">{emoji}</div>
      <h3 className="text-lg font-extrabold">{titulo}</h3>
      <p className="max-w-xs text-sm text-stone-400">{texto}</p>
      {action}
    </div>
  );
}
