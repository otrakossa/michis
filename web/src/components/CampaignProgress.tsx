"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export function CampaignProgress({ campaignId, active }: { campaignId: string; active: boolean }) {
  const [data, setData] = useState<{ reportes: number; total: number } | null>(null);
  const [mine, setMine] = useState(false);

  const load = useCallback(async () => {
    const supabase = createClient();
    const { data: rows } = await supabase.rpc("progreso_campania", { p_campaign_id: campaignId });
    const row = Array.isArray(rows) ? rows[0] : rows;
    if (row) setData({ reportes: row.reportes, total: row.total });
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data: own } = await supabase
        .from("denuncia_actions")
        .select("id").eq("campaign_id", campaignId).eq("user_id", user.id).maybeSingle();
      setMine(!!own);
    }
  }, [campaignId]);

  useEffect(() => {
    load();
    if (!active) return;
    const t = setInterval(load, 5000); // sondeo ligero mientras está abierta
    return () => clearInterval(t);
  }, [load, active]);

  if (!data) return <p className="text-sm text-stone-500">Cargando progreso…</p>;
  const pct = data.total > 0 ? Math.round((data.reportes / data.total) * 100) : 0;

  return (
    <div className="flex flex-col gap-1">
      <div className="h-3 w-full overflow-hidden rounded-full bg-stone-700">
        <div className="h-full bg-gradient-to-r from-amber-500 to-orange-400 transition-all" style={{ width: `${pct}%` }} />
      </div>
      <p className="text-sm text-stone-300">
        {data.reportes} / {data.total} ya reportaron{mine ? " · tú ya reportaste ✓" : ""}
      </p>
    </div>
  );
}
