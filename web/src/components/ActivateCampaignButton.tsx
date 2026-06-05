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
        className="btn-primary">
        📢 Activar campaña de denuncia
      </button>
    );
  }
  return (
    <div className="card flex flex-col gap-2">
      <h3 className="text-sm font-medium text-stone-400">Nueva campaña</h3>
      <textarea
        placeholder="Instrucciones para el grupo (qué reportar y cómo)"
        value={instructions} onChange={(e) => setInstructions(e.target.value)}
        rows={3} className="rounded-xl bg-stone-900 p-2 text-sm"
      />
      <input
        placeholder="URL del mecanismo de reporte"
        value={url} onChange={(e) => setUrl(e.target.value)}
        className="rounded-xl bg-stone-900 p-2 font-mono text-sm"
      />
      <div className="flex items-center gap-2">
        <button onClick={activar} disabled={busy}
          className="btn-primary disabled:opacity-50">
          Activar
        </button>
        <button onClick={() => setOpen(false)} className="text-sm text-stone-400">Cancelar</button>
        {msg && <span className="text-xs text-red-400">{msg}</span>}
      </div>
    </div>
  );
}
