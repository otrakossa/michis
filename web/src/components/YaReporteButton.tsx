"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function YaReporteButton({ campaignId }: { campaignId: string }) {
  const router = useRouter();
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onClick() {
    setBusy(true);
    setMsg(null);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setMsg("Sesión expirada: vuelve a entrar.");
      setBusy(false);
      return;
    }
    const { error } = await supabase
      .from("denuncia_actions")
      .insert({ campaign_id: campaignId, user_id: user.id });
    if (error) {
      setMsg(error.code === "23505" ? "Ya habías reportado ✓" : error.message);
    } else {
      setMsg("¡Registrado! Gracias por participar ✓");
      router.refresh();
    }
    setBusy(false);
  }

  return (
    <div className="flex items-center gap-3">
      <button onClick={onClick} disabled={busy}
        className="rounded bg-emerald-600 px-4 py-2 font-medium disabled:opacity-50">
        ✋ Ya reporté
      </button>
      {msg && <span className="text-sm text-neutral-400">{msg}</span>}
    </div>
  );
}
