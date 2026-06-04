import { createClient } from "@supabase/supabase-js";
import { config } from "./config.js";

// Cliente con service role: saltea RLS. SOLO se usa en el worker (servidor).
export const supabase = createClient(config.supabaseUrl, config.serviceRoleKey, {
  auth: { persistSession: false },
});
