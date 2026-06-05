import { cn } from "@/lib/cn";

function nivelRiesgo(score: number): "alto" | "medio" | "bajo" {
  if (score > 70) return "alto";
  if (score >= 40) return "medio";
  return "bajo";
}

export function ScoreBadge({ score }: { score?: number }) {
  if (score == null) return null;
  const r = nivelRiesgo(score);
  const cls =
    r === "alto"
      ? "bg-red-400/15 text-red-400"
      : r === "medio"
        ? "bg-orange-400/15 text-orange-400"
        : "bg-green-400/15 text-green-400";
  return (
    <span className={cn("rounded-md px-2 py-0.5 font-mono text-xs font-bold", cls)}>
      {score}
    </span>
  );
}
