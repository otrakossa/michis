import type { ReactNode } from "react";

export type Role = "activista" | "admin";

export function RoleGate({
  role,
  allow,
  children,
}: {
  role: Role;
  allow: Role[];
  children: ReactNode;
}) {
  if (!allow.includes(role)) return null;
  return <>{children}</>;
}
