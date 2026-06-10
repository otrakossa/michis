// michis — Edge Function "admin-compas"
// Gestión de compas por admins: crear / revocar(desactivar) / reactivar.
// Ver docs/superpowers/specs/2026-06-10-backend-compas-design.md
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const BAN_FOREVER = "876000h"; // ~100 años

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "método no permitido" }, 405);

  // 1. Verificar que el caller sea admin activo (cliente con su JWT).
  const authHeader = req.headers.get("Authorization") ?? "";
  const caller = createClient(SUPABASE_URL, ANON, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });
  const { data: userData } = await caller.auth.getUser();
  const callerId = userData?.user?.id;
  if (!callerId) return json({ error: "no autorizado" }, 401);

  // 2. Cliente admin con service_role.
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false },
  });
  const { data: prof } = await admin
    .from("profiles").select("role, active").eq("id", callerId).single();
  if (!prof || prof.role !== "admin" || prof.active !== true) {
    return json({ error: "no autorizado" }, 401);
  }

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json({ error: "json inválido" }, 400); }
  const accion = body.accion;

  try {
    if (accion === "crear") {
      const email = String(body.email ?? "").trim().toLowerCase();
      const display_name = String(body.display_name ?? "").trim();
      const password = String(body.password ?? "");
      const rol = String(body.rol ?? "");
      if (!EMAIL_RE.test(email)) return json({ error: "correo inválido" }, 400);
      if (rol !== "admin" && rol !== "activista") return json({ error: "rol inválido" }, 400);
      if (password.length < 8) return json({ error: "contraseña inválida" }, 400);
      if (!display_name) return json({ error: "nombre inválido" }, 400);

      const created = await admin.auth.admin.createUser({
        email, password, email_confirm: true, user_metadata: { display_name },
      });
      if (created.error) {
        const msg = /already|registered|exists/i.test(created.error.message)
          ? "compa ya existe" : created.error.message;
        return json({ error: msg }, 400);
      }
      const newId = created.data.user!.id;
      // Asigna el rol elegido por canal autorizado (service_role).
      const upd = await admin.from("profiles")
        .update({ role: rol, invited_by: callerId, display_name }).eq("id", newId);
      if (upd.error) return json({ error: upd.error.message }, 500);
      return json({ ok: true, id: newId });
    }

    if (accion === "revocar") {
      const target = String(body.target_id ?? "");
      if (!target) return json({ error: "falta target_id" }, 400);
      // Guardarraíl: no desactivar al último admin activo.
      const { data: t } = await admin.from("profiles")
        .select("role, active").eq("id", target).single();
      if (t?.role === "admin" && t.active === true) {
        const { count } = await admin.from("profiles")
          .select("id", { count: "exact", head: true })
          .eq("role", "admin").eq("active", true);
        if ((count ?? 0) <= 1) return json({ error: "tiene que quedar al menos un admin" }, 400);
      }
      const upd = await admin.from("profiles").update({ active: false }).eq("id", target);
      if (upd.error) return json({ error: upd.error.message }, 500);
      // Banear el login (reversible). El access token vigente expira por TTL;
      // el refresh ya falla al estar baneado.
      await admin.auth.admin.updateUserById(target, { ban_duration: BAN_FOREVER });
      return json({ ok: true });
    }

    if (accion === "reactivar") {
      const target = String(body.target_id ?? "");
      if (!target) return json({ error: "falta target_id" }, 400);
      const upd = await admin.from("profiles").update({ active: true }).eq("id", target);
      if (upd.error) return json({ error: upd.error.message }, 500);
      await admin.auth.admin.updateUserById(target, { ban_duration: "none" });
      return json({ ok: true });
    }

    return json({ error: "acción desconocida" }, 400);
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});
