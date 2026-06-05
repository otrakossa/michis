"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function ResolveButtons({ dossierId }: { dossierId: string }) {
  const router = useRouter();
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function resolver(decision: "aprobar" | "devolver") {
    if (decision === "aprobar" && !confirm("¿Aprobar este expediente? El caso quedará confirmado.")) return;
    setBusy(true);
    setMsg(null);
    const supabase = createClient();
    const { error } = await supabase.rpc("resolver_expediente", {
      p_dossier_id: dossierId, p_decision: decision,
    });
    if (error) setMsg(error.message);
    else router.refresh();
    setBusy(false);
  }

  return (
    <div className="flex items-center gap-2">
      <button onClick={() => resolver("aprobar")} disabled={busy}
        className="rounded bg-emerald-600 px-3 py-1.5 text-sm font-medium disabled:opacity-50">
        Aprobar
      </button>
      <button onClick={() => resolver("devolver")} disabled={busy}
        className="rounded border border-amber-800 px-3 py-1.5 text-sm text-amber-400 disabled:opacity-50">
        Devolver
      </button>
      {msg && <span className="text-xs text-red-400">{msg}</span>}
    </div>
  );
}
