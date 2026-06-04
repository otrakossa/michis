// Verificación end-to-end del pipeline de auth de Fase 0 (modelo de roles por
// canal autorizado): crear usuario -> trigger crea profile 'activista' ->
// promoción a admin solo por service role / admin.
import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Faltan SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}
const sb = createClient(url, key, { auth: { persistSession: false } });

async function deleteByEmail(email) {
  const { data } = await sb.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const found = data?.users?.find((u) => u.email === email);
  if (found) await sb.auth.admin.deleteUser(found.id);
}

async function createUser(email, opts) {
  await deleteByEmail(email);
  const { data, error } = await sb.auth.admin.createUser({
    email,
    password: "MichisDemo2026!",
    email_confirm: true,
    ...opts,
  });
  if (error) throw new Error(`createUser(${email}): ${error.message}`);
  await new Promise((r) => setTimeout(r, 400));
  return data.user.id;
}

async function getRole(id) {
  const { data, error } = await sb
    .from("profiles")
    .select("role, display_name")
    .eq("id", id)
    .single();
  if (error) throw new Error(`profile no encontrado: ${error.message}`);
  return data;
}

let allOk = true;
function check(label, role, expected) {
  const ok = role === expected;
  allOk = allOk && ok;
  console.log(`${ok ? "OK  " : "FAIL"} ${label} -> role=${role} (esperado ${expected})`);
}

// 1) Alta por defecto => 'activista'
const actId = await createUser("activista-demo@example.com", {
  user_metadata: { display_name: "Activista Demo" },
});
check("activista por defecto", (await getRole(actId)).role, "activista");

// 2) Anti-escalada: user_metadata.role=admin NO debe elevar
const intrusoId = await createUser("intruso-demo@example.com", {
  user_metadata: { role: "admin", display_name: "Intruso" },
});
check("intruso (user_metadata role)", (await getRole(intrusoId)).role, "activista");

// 3) Admin por canal autorizado: se crea activista y se promueve vía service role
const adminId = await createUser("admin-demo@example.com", {
  user_metadata: { display_name: "Admin Demo" },
});
check("admin antes de promover", (await getRole(adminId)).role, "activista");
const { error: upErr } = await sb
  .from("profiles")
  .update({ role: "admin" })
  .eq("id", adminId);
if (upErr) throw new Error(`promoción a admin falló: ${upErr.message}`);
check("admin tras promover (service role)", (await getRole(adminId)).role, "admin");

// limpieza: conservamos solo admin-demo para que puedas loguearte
await sb.auth.admin.deleteUser(actId);
await sb.auth.admin.deleteUser(intrusoId);
console.log("cleanup: activista/intruso eliminados; admin-demo conservado (login demo)");

console.log(allOk ? "\nRESULTADO: TODO OK" : "\nRESULTADO: HUBO FALLOS");
process.exit(allOk ? 0 : 1);
