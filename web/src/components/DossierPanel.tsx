"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { MiniMarkdown } from "@/components/MiniMarkdown";
import { StatusPill } from "@/components/StatusPill";

export interface DossierData {
  id: string;
  status: "draft" | "listo_admin" | "approved";
  version: number;
  content: { resumen?: string } & Record<string, unknown>;
  submitted_at: string | null;
}

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
    <div className="card flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium text-stone-400">
          Expediente · v{dossier.version}
        </h2>
        <StatusPill mapa="dossier" estado={dossier.status} />
      </div>

      {editable ? (
        <>
          <textarea
            value={resumen}
            onChange={(e) => setResumen(e.target.value)}
            rows={10}
            className="rounded-xl bg-stone-900 p-3 font-mono text-sm"
          />
          <div className="flex items-center gap-3">
            <button onClick={guardar} disabled={busy}
              className="btn-ghost">
              Guardar
            </button>
            <button onClick={elevar} disabled={busy}
              className="btn-primary">
              Elevar al admin
            </button>
            {msg && <span className="text-sm text-stone-400">{msg}</span>}
          </div>
        </>
      ) : (
        <MiniMarkdown text={dossier.content.resumen ?? ""} />
      )}
    </div>
  );
}
