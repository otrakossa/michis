import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ResolveButtons } from "@/components/ResolveButtons";

export default async function ExpedientesPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: profile } = await supabase
    .from("profiles").select("role").eq("id", user.id).single();
  if (profile?.role !== "admin") redirect("/");

  const { data: dossiers } = await supabase
    .from("dossiers")
    .select("id, content, submitted_at, case:cases(id, handle, platform, risk_score)")
    .eq("status", "listo_admin")
    .order("submitted_at", { ascending: true });

  return (
    <section className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold">Expedientes pendientes</h1>
      <ul className="flex flex-col gap-3">
        {(dossiers ?? []).map((d) => {
          const caso = d.case as unknown as {
            id: string; handle: string; platform: string; risk_score: number | null;
          };
          return (
            <li key={d.id} className="flex items-center justify-between gap-4 rounded border border-neutral-800 p-3">
              <div className="text-sm">
                <Link href={`/casos/${caso.id}`} className="font-mono underline">
                  @{caso.handle}
                </Link>
                <span className="text-neutral-400">
                  {" "}· {caso.platform} · score {caso.risk_score ?? "?"} · elevado{" "}
                  {d.submitted_at ? new Date(d.submitted_at).toLocaleString("es") : ""}
                </span>
              </div>
              <ResolveButtons dossierId={d.id} />
            </li>
          );
        })}
        {(dossiers ?? []).length === 0 && (
          <li className="text-neutral-500">No hay expedientes pendientes de revisión.</li>
        )}
      </ul>
    </section>
  );
}
