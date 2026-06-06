import { Bot } from "lucide-react";
import { cn } from "@/lib/cn";

export function AIBadge() {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-400",
      )}
    >
      <Bot className="size-3" /> IA
    </span>
  );
}
