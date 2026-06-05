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
  // Cola vacía: PostgREST serializa el NULL compuesto de claim_job como un
  // objeto con todos los campos en null — tratarlo como "no hay job".
  const job = data as Job | null;
  if (!job || !job.id) return null;
  return job;
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
