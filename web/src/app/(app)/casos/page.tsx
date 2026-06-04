import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

const ESTADOS = ["nuevo", "investigando", "needs_review", "confirmado", "descartado"] as const;

export default async function CasosPage({
  searchParams,
}: {
  searchParams: Promise<{ estado?: string }>;
}) {
  const { estado } = await searchParams;
  const supabase = await createClient();

  let query = supabase
    .from("cases")
    .select("id, handle, platform, status, created_at")
    .order("created_at", { ascending: false });
  if (estado && (ESTADOS as readonly string[]).includes(estado)) {
    query = query.eq("status", estado);
  }
  const { data: casos } = await query;

  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Casos</h1>
        <Link href="/casos/nuevo" className="rounded bg-emerald-600 px-3 py-2 text-sm font-medium">
          + Nuevo caso
        </Link>
      </div>

      <nav className="flex flex-wrap gap-2 text-sm">
        <Link href="/casos" className={!estado ? "text-emerald-400" : "text-neutral-400"}>
          todos
        </Link>
        {ESTADOS.map((e) => (
          <Link
            key={e}
            href={`/casos?estado=${e}`}
            className={estado === e ? "text-emerald-400" : "text-neutral-400"}
          >
            {e}
          </Link>
        ))}
      </nav>

      <ul className="flex flex-col gap-2">
        {(casos ?? []).map((c) => (
          <li key={c.id}>
            <Link
              href={`/casos/${c.id}`}
              className="flex items-center justify-between rounded border border-neutral-800 p-3 hover:border-neutral-600"
            >
              <span className="font-mono">@{c.handle}</span>
              <span className="text-sm text-neutral-400">
                {c.platform} · {c.status}
              </span>
            </Link>
          </li>
        ))}
        {(casos ?? []).length === 0 && (
          <li className="text-neutral-500">No hay casos{estado ? ` en estado "${estado}"` : ""}.</li>
        )}
      </ul>
    </section>
  );
}
