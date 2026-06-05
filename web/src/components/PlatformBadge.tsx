import { cn } from "@/lib/cn";

export function PlatformBadge({ plataforma }: { plataforma: "X" | "TikTok" }) {
  return (
    <span
      className={cn(
        "rounded-md border border-stone-700 bg-stone-800 px-1.5 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wider text-stone-400",
      )}
    >
      {plataforma}
    </span>
  );
}
