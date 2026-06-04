"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { normalizeHandle, isValidHandle } from "@/lib/handle";

export default function CasoNuevoPage() {
  const router = useRouter();
  const [platform, setPlatform] = useState<"twitter" | "tiktok">("twitter");
  const [handle, setHandle] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [dupId, setDupId] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setDupId(null);

    const h = normalizeHandle(handle);
    if (!isValidHandle(h)) {
      setError("Handle inválido: usa letras, números, _ o . (máx 30).");
      return;
    }

    setSending(true);
    const supabase = createClient();

    // Pre-chequeo de duplicado (al enviar): aviso amable con link.
    const { data: existing } = await supabase
      .from("cases").select("id").eq("platform", platform).eq("handle", h).maybeSingle();
    if (existing) {
      setDupId(existing.id);
      setSending(false);
      return;
    }

    const { data: { user } } = await supabase.auth.getUser();
    const { data, error: insErr } = await supabase
      .from("cases")
      .insert({ platform, handle: h, notes: notes || null, created_by: user!.id })
      .select("id")
      .single();

    if (insErr) {
      // 23505 = índice único (carrera): otro lo creó entre el pre-chequeo y el insert.
      if (insErr.code === "23505") {
        const { data: again } = await supabase
          .from("cases").select("id").eq("platform", platform).eq("handle", h).maybeSingle();
        if (again) setDupId(again.id);
        else setError("Ya existe un caso para esa cuenta (no visible para ti).");
      } else {
        setError(insErr.message);
      }
      setSending(false);
      return;
    }

    router.push(`/casos/${data.id}`);
  }

  return (
    <section className="mx-auto flex max-w-md flex-col gap-4">
      <h1 className="text-xl font-semibold">Nuevo caso</h1>
      <form onSubmit={onSubmit} className="flex flex-col gap-3">
        <select
          value={platform}
          onChange={(e) => setPlatform(e.target.value as "twitter" | "tiktok")}
          className="rounded bg-neutral-900 p-2"
        >
          <option value="twitter">X / Twitter</option>
          <option value="tiktok">TikTok</option>
        </select>
        <input
          placeholder="@handle"
          value={handle}
          onChange={(e) => setHandle(e.target.value)}
          className="rounded bg-neutral-900 p-2 font-mono"
        />
        <textarea
          placeholder="Notas: ¿por qué te parece sospechosa esta cuenta?"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={4}
          className="rounded bg-neutral-900 p-2"
        />
        <button
          type="submit"
          disabled={sending}
          className="rounded bg-emerald-600 p-2 font-medium disabled:opacity-50"
        >
          Crear caso
        </button>
        {error && <p className="text-sm text-red-400">{error}</p>}
        {dupId && (
          <p className="text-sm text-amber-400">
            Ya existe un caso para esa cuenta.{" "}
            <a href={`/casos/${dupId}`} className="underline">Ver caso existente →</a>
          </p>
        )}
      </form>
    </section>
  );
}
