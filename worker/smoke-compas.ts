// Smoke E2E de la Edge Function admin-compas (requiere deploy).
// Correr: RUN_REAL_COMPAS_TEST=1 npx tsx worker/smoke-compas.ts
import { createClient } from "@supabase/supabase-js";
import { config } from "./src/config.js";

if (process.env.RUN_REAL_COMPAS_TEST !== "1") {
  console.log("Saltado (set RUN_REAL_COMPAS_TEST=1 para correr).");
  process.exit(0);
}
const URL = config.supabaseUrl;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const svc = createClient(URL, config.serviceRoleKey, { auth: { persistSession: false } });
const ADM = "smoke-compas-adm@example.com";
const NUEVO = "smoke-compas-nuevo@example.com";
const PASS = "SmokeCompas2026!";

async function delUser(email: string) {
  const { data } = await svc.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const u = data?.users?.find((x) => x.email === email);
  if (u) await svc.auth.admin.deleteUser(u.id);
}

const main = async () => {
  for (const e of [ADM, NUEVO]) await delUser(e);
  const a = await svc.auth.admin.createUser({ email: ADM, password: PASS, email_confirm: true });
  await svc.from("profiles").update({ role: "admin" }).eq("id", a.data.user!.id);
  const cli = createClient(URL, ANON);
  await cli.auth.signInWithPassword({ email: ADM, password: PASS });

  let r = await cli.functions.invoke("admin-compas", {
    body: { accion: "crear", display_name: "Compa Smoke", email: NUEVO, password: "TempPass1234!", rol: "activista" },
  });
  console.log("crear:", r.error ? await (r.error as { context: Response }).context.json() : r.data);

  const list = await cli.rpc("admin_listar_compas");
  const nuevo = (list.data as Array<{ id: string; email: string; estado: string }>).find((c) => c.email === NUEVO);
  console.log("listar → nuevo:", nuevo);

  r = await cli.functions.invoke("admin-compas", { body: { accion: "revocar", target_id: nuevo!.id } });
  console.log("revocar:", r.error ?? r.data);
  r = await cli.functions.invoke("admin-compas", { body: { accion: "reactivar", target_id: nuevo!.id } });
  console.log("reactivar:", r.error ?? r.data);

  for (const e of [ADM, NUEVO]) await delUser(e);
  console.log("✅ smoke OK");
};
main().catch((e) => { console.error(e); process.exit(1); });
