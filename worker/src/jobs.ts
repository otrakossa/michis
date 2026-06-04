import { supabase } from "./supabase.js";

export interface Job {
  id: string;
  type: string;
  payload: Record<string, unknown>;
  status: string;
  attempts: number;
}

export async function claimNextJob(): Promise<Job | null> {
  const { data, error } = await supabase.rpc("claim_job");
  if (error) throw error;
  // claim_job devuelve una fila o null
  return (data as Job | null) ?? null;
}

export async function completeJob(id: string): Promise<void> {
  const { error } = await supabase.from("jobs").update({ status: "done" }).eq("id", id);
  if (error) throw error;
}

export async function failJob(id: string, message: string): Promise<void> {
  const { error } = await supabase
    .from("jobs")
    .update({ status: "failed", last_error: message })
    .eq("id", id);
  if (error) throw error;
}
