import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { CampaignProgress } from "@/components/CampaignProgress";

interface CampaignRow {
  id: string;
  status: string;
  resultado: string | null;
  created_at: string;
  case: { id: string; handle: string; platform: string };
}

export default async function CampaniasPage() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("denuncia_campaigns")
    .select("id, status, resultado, created_at, case:cases(id, handle, platform)")
    .order("created_at", { ascending: false });
  const campanias = (data ?? []) as unknown as CampaignRow[];
  const activas = campanias.filter((c) => c.status === "active");
  const cerradas = campanias.filter((c) => c.status === "closed");

  return (
    <section className="flex flex-col gap-6">
      <div>
        <h1 className="mb-3 text-xl font-semibold">Campañas activas</h1>
        <ul className="flex flex-col gap-3">
          {activas.map((c) => (
            <li key={c.id} className="card ring-1 ring-amber-500/40">
              <Link href={`/campanias/${c.id}`} className="font-mono underline">
                @{c.case.handle}
              </Link>
              <span className="text-sm text-neutral-400"> · {c.case.platform}</span>
              <div className="mt-2">
                <CampaignProgress campaignId={c.id} active={false} />
              </div>
            </li>
          ))}
          {activas.length === 0 && (
            <li className="text-neutral-500">No hay campañas activas.</li>
          )}
        </ul>
      </div>

      {cerradas.length > 0 && (
        <div>
          <h2 className="mb-3 text-sm font-medium text-neutral-400">Cerradas</h2>
          <ul className="flex flex-col gap-2 text-sm">
            {cerradas.map((c) => (
              <li key={c.id} className="card opacity-70">
                <Link href={`/campanias/${c.id}`} className="font-mono underline">
                  @{c.case.handle}
                </Link>
                <span className="text-neutral-400"> · resultado: {c.resultado ?? "—"}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
