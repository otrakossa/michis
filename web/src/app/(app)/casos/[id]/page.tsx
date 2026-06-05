import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { RoleGate, type Role } from "@/components/RoleGate";
import { InvestigateButton } from "@/components/InvestigateButton";
import { DeleteCaseButton } from "@/components/DeleteCaseButton";
import { VerdictView, type VerdictData } from "@/components/VerdictView";
import { DossierPanel, type DossierData } from "@/components/DossierPanel";
import { ActivateCampaignButton } from "@/components/ActivateCampaignButton";
import { ESTADO_CASO, ESTADO_RUN, etiquetaEstado } from "@/lib/estados";

export default async function CasoDetallePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: caso } = await supabase
    .from("cases")
    .select("id, handle, platform, status, notes, created_at, created_by")
    .eq("id", id)
    .maybeSingle();
  if (!caso) notFound();

  const { data: runs } = await supabase
    .from("investigation_runs")
    .select("id, status, verdict, created_at, finished_at")
    .eq("case_id", id)
    .order("created_at", { ascending: false });

  const { data: dossier } = await supabase
    .from("dossiers")
    .select("id, status, version, content, submitted_at")
    .eq("case_id", id)
    .maybeSingle();

  const { data: activeCampaign } = await supabase
    .from("denuncia_campaigns")
    .select("id").eq("case_id", id).eq("status", "active").maybeSingle();

  const { data: { user } } = await supabase.auth.getUser();
  const { data: profile } = await supabase
    .from("profiles").select("role").eq("id", user!.id).single();
  const role: Role = (profile?.role as Role) ?? "activista";

  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-extrabold font-mono">@{caso.handle}</h1>
          <p className="text-sm text-stone-400">
            {caso.platform} ·{" "}
            <span className="text-orange-400 font-semibold">{etiquetaEstado(ESTADO_CASO, caso.status)}</span>
            {" "}· {new Date(caso.created_at).toLocaleDateString("es")}
          </p>
        </div>
        <RoleGate role={role} allow={["admin"]}>
          <DeleteCaseButton caseId={caso.id} />
        </RoleGate>
      </div>

      {caso.notes && (
        <div className="card">
          <h2 className="mb-1 text-sm font-medium text-stone-400">Notas</h2>
          <p className="whitespace-pre-wrap">{caso.notes}</p>
        </div>
      )}

      <InvestigateButton caseId={caso.id} />

      {runs && runs.length > 0 && runs[0].verdict != null && (
        <div>
          <h2 className="mb-2 text-sm font-medium text-neutral-400">Veredicto del agente</h2>
          <VerdictView verdict={runs[0].verdict as VerdictData} />
        </div>
      )}

      {dossier && <DossierPanel dossier={dossier as DossierData} />}

      {caso.status === "confirmado" &&
        (activeCampaign ? (
          <Link href={`/campanias/${activeCampaign.id}`}
            className="btn-ghost w-fit">
            📢 Ver campaña activa →
          </Link>
        ) : (
          <RoleGate role={role} allow={["admin"]}>
            <ActivateCampaignButton caseId={caso.id} />
          </RoleGate>
        ))}

      <div>
        <h2 className="mb-2 text-sm font-medium text-stone-400">Investigaciones</h2>
        <ul className="flex flex-col gap-2">
          {(runs ?? []).map((r) => (
            <li key={r.id} className="card text-sm">
              <span className="font-medium">{etiquetaEstado(ESTADO_RUN, r.status)}</span>
              <span className="text-stone-400">
                {" "}· {new Date(r.created_at).toLocaleString("es")}
              </span>
              {r.verdict != null && (
                <p className="mt-1 text-stone-400">
                  {(r.verdict as { summary?: string }).summary ?? ""}
                </p>
              )}
            </li>
          ))}
          {(runs ?? []).length === 0 && (
            <li className="text-stone-500">Sin investigaciones todavía.</li>
          )}
        </ul>
      </div>
    </section>
  );
}
