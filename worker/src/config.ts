function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Falta la variable de entorno ${name}`);
  return value;
}

export const config = {
  supabaseUrl: required("SUPABASE_URL"),
  serviceRoleKey: required("SUPABASE_SERVICE_ROLE_KEY"),
  pollIntervalMs: Number(process.env.WORKER_POLL_INTERVAL_MS ?? "2000"),
  // Agente investigador (opcionales: sin ellos hay degradación elegante)
  anthropicApiKey: process.env.ANTHROPIC_API_KEY ?? null,
  xBearerToken: process.env.X_BEARER_TOKEN ?? null,
  agentMaxIterations: Number(process.env.AGENT_MAX_ITERATIONS ?? "8"),
  agentBudgetUsd: Number(process.env.AGENT_BUDGET_USD ?? "0.5"),
};
