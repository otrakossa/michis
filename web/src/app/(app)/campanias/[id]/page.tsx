import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { RoleGate, type Role } from "@/components/RoleGate";
import { CampaignProgress } from "@/components/CampaignProgress";
import { YaReporteButton } from "@/components/YaReporteButton";
import { CerrarCampaniaButton } from "@/components/CerrarCampaniaButton";

export default async function CampaniaDetallePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data } = await supabase
    .from("denuncia_campaigns")
    .select("id, status, instructions, report_links, resultado, created_at, case:cases(id, handle, platform)")
    .eq("id", id)
    .maybeSingle();
  if (!data) notFound();
  const camp = data as unknown as {
    id: string; status: string; instructions: string | null;
    report_links: { url?: string } | null; resultado: string | null; created_at: string;
    case: { id: string; handle: string; platform: string };
  };

  const { data: { user } } = await supabase.auth.getUser();
  const { data: profile } = await supabase
    .from("profiles").select("role").eq("id", user!.id).single();
  const role: Role = (profile?.role as Role) ?? "activista";
  const activa = camp.status === "active";

  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-mono text-xl font-semibold">📢 @{camp.case.handle}</h1>
          <p className="text-sm text-neutral-400">
            {camp.case.platform} · campaña {activa ? "activa" : `cerrada (${camp.resultado ?? "—"})`} ·{" "}
            <Link href={`/casos/${camp.case.id}`} className="underline">ver caso y expediente</Link>
          </p>
        </div>
        {activa && (
          <RoleGate role={role} allow={["admin"]}>
            <CerrarCampaniaButton campaignId={camp.id} />
          </RoleGate>
        )}
      </div>

      {camp.instructions && (
        <div className="rounded border border-neutral-800 p-3">
          <h2 className="mb-1 text-sm font-medium text-neutral-400">Instrucciones</h2>
          <p className="whitespace-pre-wrap text-sm">{camp.instructions}</p>
        </div>
      )}

      <CampaignProgress campaignId={camp.id} active={activa} />

      {activa && (
        <div className="flex flex-col gap-3">
          {(() => {
            // Guard en el sink: solo http(s); una URL javascript: sería XSS.
            const url = camp.report_links?.url;
            const safeUrl = url && /^https?:\/\//i.test(url) ? url : null;
            return safeUrl ? (
              <a href={safeUrl} target="_blank" rel="noopener noreferrer"
                className="w-fit rounded border border-neutral-700 px-4 py-2 text-sm">
                🔗 Abrir mecanismo de reporte
              </a>
            ) : null;
          })()}
          <YaReporteButton campaignId={camp.id} />
        </div>
      )}
    </section>
  );
}
