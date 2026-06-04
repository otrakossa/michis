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

  return (
    <div className="min-h-screen">
      <header className="flex items-center justify-between border-b border-neutral-800 p-4">
        <span className="font-semibold">michis</span>
        <span className="text-sm text-neutral-400">
          {profile?.display_name ?? user.email} · {role}
        </span>
      </header>
      <main className="p-4">{children}</main>
    </div>
  );
}
