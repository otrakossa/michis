"use client";

import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function DeleteCaseButton({ caseId }: { caseId: string }) {
  const router = useRouter();

  async function onClick() {
    if (!confirm("¿Eliminar este caso y todo su historial? No se puede deshacer.")) return;
    const supabase = createClient();
    const { error } = await supabase.from("cases").delete().eq("id", caseId);
    if (error) {
      alert(`No se pudo eliminar: ${error.message}`);
      return;
    }
    router.push("/casos");
  }

  return (
    <button onClick={onClick} className="btn-danger">
      Eliminar caso
    </button>
  );
}
