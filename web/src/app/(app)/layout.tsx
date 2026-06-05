import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Role } from "@/components/RoleGate";

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
          <span className="font-extrabold">🐱 michis</span>
          <a href="/casos" className="text-sm text-stone-300 hover:text-orange-400">Casos</a>
          <a href="/campanias" className="text-sm text-stone-300 hover:text-orange-400">
            Campañas
            {(campActivas ?? 0) > 0 && (
              <span className="badge-accion ml-1">
                {campActivas}
              </span>
            )}
          </a>
          {role === "admin" && (
            <a href="/expedientes" className="text-sm text-stone-300 hover:text-orange-400">Expedientes</a>
          )}
        </nav>
        <span className="text-sm text-stone-400">
          {profile?.display_name ?? user.email} · {role}
        </span>
      </header>
      <main className="p-4">{children}</main>
    </div>
  );
}
