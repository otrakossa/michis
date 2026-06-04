import { claimNextJob, completeJob, failJob } from "./jobs.js";
import { getHandler, handlerExists } from "./handlers.js";

// Procesa un único job si hay alguno pendiente. Devuelve true si procesó algo.
export async function tick(): Promise<boolean> {
  const job = await claimNextJob();
  if (!job) return false;

  try {
    if (!handlerExists(job.type)) {
      await failJob(job.id, `Tipo de job sin handler: ${job.type}`);
      return true;
    }
    await getHandler(job.type)(job.payload);
    await completeJob(job.id);
  } catch (err) {
    await failJob(job.id, err instanceof Error ? err.message : String(err));
  }
  return true;
}

// Bucle infinito: procesa jobs; si no hay, duerme `intervalMs`.
export async function runLoop(intervalMs: number, shouldStop = () => false): Promise<void> {
  while (!shouldStop()) {
    const processed = await tick();
    if (!processed) {
      await new Promise((r) => setTimeout(r, intervalMs));
    }
  }
}
