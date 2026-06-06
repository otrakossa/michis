import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { ESTADO_CASO, etiquetaEstado } from "@/lib/estados";
import { StatusPill } from "@/components/StatusPill";
import { ScoreBadge } from "@/components/ScoreBadge";
import { PlatformBadge } from "@/components/PlatformBadge";
import { EmptyState } from "@/components/EmptyState";

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
    .select("id, handle, platform, status, created_at, risk_score")
    .order("created_at", { ascending: false });
  if (estado && (ESTADOS as readonly string[]).includes(estado)) {
    query = query.eq("status", estado);
  }
  const { data: casos } = await query;

  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Casos</h1>
        <Link href="/casos/nuevo" className="btn-primary">
          + Nuevo caso
        </Link>
      </div>

      <nav className="flex flex-wrap gap-2 text-sm">
        <Link
          href="/casos"
          className={!estado ? "chip !bg-amber-500 !text-stone-900 font-bold" : "chip"}
        >
          todos
        </Link>
        {ESTADOS.map((e) => (
          <Link
            key={e}
            href={`/casos?estado=${e}`}
            className={estado === e ? "chip !bg-amber-500 !text-stone-900 font-bold" : "chip"}
          >
            {etiquetaEstado(ESTADO_CASO, e)}
          </Link>
        ))}
      </nav>

      {(casos ?? []).length === 0 ? (
        <EmptyState
          emoji="🐱"
          titulo="Ningún caso todavía"
          texto="¿Viste algo raro en redes? Carga la primera cuenta sospechosa."
          action={
            <Link className="btn-primary" href="/casos/nuevo">
              + Nuevo caso
            </Link>
          }
        />
      ) : (
        <ul className="flex flex-col gap-2">
          {(casos ?? []).map((c) => (
            <li key={c.id}>
              <Link
                href={`/casos/${c.id}`}
                className="card flex items-center justify-between hover:ring-1 hover:ring-amber-500/50"
              >
                <span className="font-mono">@{c.handle}</span>
                <span className="flex items-center gap-2">
                  <PlatformBadge plataforma={c.platform as "X" | "TikTok"} />
                  <ScoreBadge score={c.risk_score ?? undefined} />
                  <StatusPill mapa="caso" estado={c.status} />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
