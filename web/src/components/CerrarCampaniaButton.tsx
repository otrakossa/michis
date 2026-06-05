"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function CerrarCampaniaButton({ campaignId }: { campaignId: string }) {
  const router = useRouter();
  const [msg, setMsg] = useState<string | null>(null);

  async function onClick() {
    const resultado = prompt("Resultado de la campaña (ej: cuenta suspendida, sin respuesta):");
    if (resultado === null) return;
    const supabase = createClient();
    const { error } = await supabase.rpc("cerrar_campania", {
      p_campaign_id: campaignId, p_resultado: resultado || "sin especificar",
    });
    if (error) setMsg(error.message);
    else router.refresh();
  }

  return (
    <div className="flex items-center gap-2">
      <button onClick={onClick}
        className="rounded border border-neutral-700 px-3 py-1.5 text-sm text-neutral-300">
        Cerrar campaña
      </button>
      {msg && <span className="text-xs text-red-400">{msg}</span>}
    </div>
  );
}
