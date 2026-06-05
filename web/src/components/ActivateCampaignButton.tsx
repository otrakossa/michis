"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function ActivateCampaignButton({ caseId }: { caseId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [instructions, setInstructions] = useState("");
  const [url, setUrl] = useState("https://help.x.com/es/forms");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function activar() {
    if (!/^https?:\/\//i.test(url)) {
      setMsg("La URL de reporte debe empezar con http:// o https://");
      return;
    }
    setBusy(true);
    setMsg(null);
    const supabase = createClient();
    const { data, error } = await supabase.rpc("activar_campania", {
      p_case_id: caseId, p_instructions: instructions, p_report_url: url,
    });
    if (error) {
      setMsg(error.message);
      setBusy(false);
      return;
    }
    router.push(`/campanias/${data}`);
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)}
        className="rounded bg-emerald-600 px-3 py-2 text-sm font-medium">
        📢 Activar campaña de denuncia
      </button>
    );
  }
  return (
    <div className="flex flex-col gap-2 rounded border border-neutral-800 p-3">
      <h3 className="text-sm font-medium text-neutral-400">Nueva campaña</h3>
      <textarea
        placeholder="Instrucciones para el grupo (qué reportar y cómo)"
        value={instructions} onChange={(e) => setInstructions(e.target.value)}
        rows={3} className="rounded bg-neutral-900 p-2 text-sm"
      />
      <input
        placeholder="URL del mecanismo de reporte"
        value={url} onChange={(e) => setUrl(e.target.value)}
        className="rounded bg-neutral-900 p-2 font-mono text-sm"
      />
      <div className="flex items-center gap-2">
        <button onClick={activar} disabled={busy}
          className="rounded bg-emerald-600 px-3 py-2 text-sm font-medium disabled:opacity-50">
          Activar
        </button>
        <button onClick={() => setOpen(false)} className="text-sm text-neutral-400">Cancelar</button>
        {msg && <span className="text-xs text-red-400">{msg}</span>}
      </div>
    </div>
  );
}
