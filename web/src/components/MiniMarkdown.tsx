import { cn } from "@/lib/cn";

function renderInline(s: string): React.ReactNode {
  const parts = s.split(/(\*\*[^*]+\*\*|_[^_]+_)/g);
  return parts.map((p, i) => {
    if (p.startsWith("**") && p.endsWith("**"))
      return (
        <strong key={i} className="font-bold text-stone-100">
          {p.slice(2, -2)}
        </strong>
      );
    if (p.startsWith("_") && p.endsWith("_"))
      return (
        <em key={i} className="italic text-stone-400">
          {p.slice(1, -1)}
        </em>
      );
    return <span key={i}>{p}</span>;
  });
}

export function MiniMarkdown({ text }: { text: string }) {
  const lines = text.split("\n");
  return (
    <div className={cn("space-y-2 text-sm leading-relaxed text-stone-200/90")}>
      {lines.map((l, i) => {
        if (!l.trim()) return <div key={i} className="h-1" />;
        if (l.startsWith("### "))
          return (
            <h3 key={i} className="text-base font-extrabold">
              {l.slice(4)}
            </h3>
          );
        if (l.startsWith("## "))
          return (
            <h2 key={i} className="text-lg font-extrabold">
              {l.slice(3)}
            </h2>
          );
        if (l.startsWith("# "))
          return (
            <h1 key={i} className="text-xl font-extrabold">
              {l.slice(2)}
            </h1>
          );
        if (l.startsWith("> "))
          return (
            <blockquote
              key={i}
              className="border-l-2 border-amber-400 pl-3 italic text-stone-400"
            >
              {renderInline(l.slice(2))}
            </blockquote>
          );
        if (l.startsWith("- "))
          return (
            <div key={i} className="flex gap-2">
              <span className="text-amber-400">·</span>
              <span>{renderInline(l.slice(2))}</span>
            </div>
          );
        if (l.match(/^\d+\.\s/))
          return (
            <div key={i} className="flex gap-2">
              <span className="font-mono text-amber-400">{l.match(/^\d+/)![0]}.</span>
              <span>{renderInline(l.replace(/^\d+\.\s/, ""))}</span>
            </div>
          );
        if (l === "---") return <hr key={i} className="border-stone-700" />;
        return <p key={i}>{renderInline(l)}</p>;
      })}
    </div>
  );
}
