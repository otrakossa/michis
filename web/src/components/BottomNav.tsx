"use client";

// Portado de michis-alerta/src/components/michis/ui.tsx líneas 45-80
// Adaptaciones: usePathname() de next/navigation, Link de next/link,
// props tipadas { role, activeCampaigns }, sin ítem Perfil, punto ámbar pulse-soft en Campañas

import Link from "next/link";
import { usePathname } from "next/navigation";
import { FileSearch, CheckCircle2, Megaphone } from "lucide-react";
import { cn } from "@/lib/cn";
import type { Role } from "@/components/RoleGate";

export function BottomNav({
  role,
  activeCampaigns,
}: {
  role: Role;
  activeCampaigns: number;
}) {
  const pathname = usePathname();

  const items = [
    { href: "/casos", label: "Casos", icon: FileSearch, hasDot: false },
    ...(role === "admin"
      ? [{ href: "/expedientes", label: "Expedientes", icon: CheckCircle2, hasDot: false }]
      : []),
    {
      href: "/campanias",
      label: "Campañas",
      icon: Megaphone,
      hasDot: activeCampaigns > 0,
    },
  ] as const;

  const cols = items.length === 3 ? "grid-cols-3" : "grid-cols-2";

  return (
    <nav
      className={cn(
        "fixed inset-x-0 bottom-0 z-30 border-t border-stone-700 bg-stone-800/95 backdrop-blur pb-[env(safe-area-inset-bottom)]",
        "sm:hidden",
      )}
    >
      <div className={cn("mx-auto grid max-w-2xl px-2", cols)}>
        {items.map((it) => {
          const active = pathname.startsWith(it.href);
          const Icon = it.icon;
          return (
            <Link
              key={it.href}
              href={it.href}
              className={cn(
                "relative flex flex-col items-center gap-0.5 py-2.5 text-[11px] font-medium transition-colors",
                active ? "text-amber-400" : "text-stone-400",
              )}
            >
              <span className="relative">
                <Icon
                  className="size-5"
                  strokeWidth={active ? 2.4 : 1.8}
                />
                {it.hasDot && (
                  <span className="absolute -right-1 -top-1 size-1.5 rounded-full bg-amber-500 pulse-soft" />
                )}
              </span>
              <span>{it.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
