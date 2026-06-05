"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function InvestigateButton({ caseId }: { caseId: string }) {
  const router = useRouter();
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onClick() {
    setBusy(true);
    setMsg(null);
    const supabase = createClient();
    const { error } = await supabase.rpc("enqueue_investigation", { p_case_id: caseId });
    if (error) {
      setMsg(
        error.message.includes("en curso")
          ? "Ya hay una investigación en curso para este caso."
          : error.message,
      );
    } else {
      setMsg("Investigación encolada ✓");
      router.refresh();
    }
    setBusy(false);
  }

  return (
    <div className="flex items-center gap-3">
      <button
        onClick={onClick}
        disabled={busy}
        className="btn-primary"
      >
        ▶ Investigar
      </button>
      {msg && <span className="text-sm text-stone-400">{msg}</span>}
    </div>
  );
}
