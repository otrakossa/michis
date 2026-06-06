import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Role } from "@/components/RoleGate";
import { BottomNav } from "@/components/BottomNav";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles").select("role, display_name").eq("id", user.id).single();
  const role: Role = (profile?.role as Role) ?? "activista";

  const { count: campActivas } = await supabase
    .from("denuncia_campaigns")
    .select("id", { count: "exact", head: true })
    .eq("status", "active");

  return (
    <div className="min-h-screen">
      <header className="flex items-center justify-between border-b border-stone-700 bg-stone-800 p-4">
        <nav className="flex items-center gap-4">
          {/* La marca siempre visible */}
          <span className="font-extrabold">🐱 michis</span>

          {/* Links de texto: solo en pantallas sm+ */}
          <div className="hidden sm:flex items-center gap-4">
            <a href="/casos" className="text-sm text-stone-300 hover:text-orange-400">Casos</a>
            <a href="/campanias" className="text-sm text-stone-300 hover:text-orange-400">Campañas</a>
            {role === "admin" && (
              <a href="/expedientes" className="text-sm text-stone-300 hover:text-orange-400">Expedientes</a>
            )}
          </div>
        </nav>

        <div className="flex items-center gap-3">
          {/* Pill de campañas activas — visible siempre que haya activas */}
          {(campActivas ?? 0) > 0 && (
            <a
              href="/campanias"
              className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/15 px-2.5 py-1 text-xs font-bold text-amber-400"
            >
              <span className="size-1.5 rounded-full bg-amber-500 pulse-soft" />
              {campActivas} {campActivas === 1 ? "campaña" : "campañas"}
            </a>
          )}

          <span className="text-sm text-stone-400">
            {profile?.display_name ?? user.email} · {role}
          </span>
        </div>
      </header>

      <main className="p-4 pb-24 sm:pb-4">{children}</main>

      <BottomNav role={role} activeCampaigns={campActivas ?? 0} />
    </div>
  );
}
