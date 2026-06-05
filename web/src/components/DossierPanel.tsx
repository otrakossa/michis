"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export interface DossierData {
  id: string;
  status: "draft" | "listo_admin" | "approved";
  version: number;
  content: { resumen?: string } & Record<string, unknown>;
  submitted_at: string | null;
}

const STATUS_LABEL: Record<DossierData["status"], string> = {
  draft: "borrador",
  listo_admin: "pendiente de admin",
  approved: "aprobado",
};

export function DossierPanel({ dossier }: { dossier: DossierData }) {
  const router = useRouter();
  const [resumen, setResumen] = useState(dossier.content.resumen ?? "");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const editable = dossier.status === "draft";

  async function guardar() {
    setBusy(true);
    setMsg(null);
    const supabase = createClient();
    const { error } = await supabase
      .from("dossiers")
      .update({ content: { ...dossier.content, resumen } })
      .eq("id", dossier.id);
    setMsg(error ? error.message : "Guardado ✓");
    setBusy(false);
  }

  async function elevar() {
    if (!confirm("¿Elevar este expediente al admin? Dejará de ser editable.")) return;
    setBusy(true);
    setMsg(null);
    const supabase = createClient();
    const { error } = await supabase.rpc("elevar_expediente", { p_dossier_id: dossier.id });
    if (error) {
      setMsg(error.message);
    } else {
      setMsg("Elevado al admin ✓");
      router.refresh();
    }
    setBusy(false);
  }

  return (
    <div className="flex flex-col gap-3 rounded border border-neutral-800 p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium text-neutral-400">
          Expediente · v{dossier.version}
        </h2>
        <span className="rounded bg-neutral-900 px-2 py-1 text-xs text-neutral-300">
          {STATUS_LABEL[dossier.status]}
        </span>
      </div>

      {editable ? (
        <>
          <textarea
            value={resumen}
            onChange={(e) => setResumen(e.target.value)}
            rows={10}
            className="rounded bg-neutral-900 p-2 font-mono text-sm"
          />
          <div className="flex items-center gap-3">
            <button onClick={guardar} disabled={busy}
              className="rounded border border-neutral-700 px-3 py-2 text-sm disabled:opacity-50">
              Guardar
            </button>
            <button onClick={elevar} disabled={busy}
              className="rounded bg-emerald-600 px-3 py-2 text-sm font-medium disabled:opacity-50">
              Elevar al admin
            </button>
            {msg && <span className="text-sm text-neutral-400">{msg}</span>}
          </div>
        </>
      ) : (
        <pre className="whitespace-pre-wrap rounded bg-neutral-900 p-3 font-mono text-sm">
          {dossier.content.resumen ?? ""}
        </pre>
      )}
    </div>
  );
}
