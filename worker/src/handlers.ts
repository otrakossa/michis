export type JobHandler = (payload: Record<string, unknown>) => Promise<void>;

const handlers = new Map<string, JobHandler>();

export function registerHandler(type: string, handler: JobHandler): void {
  handlers.set(type, handler);
}

export function handlerExists(type: string): boolean {
  return handlers.has(type);
}

export function getHandler(type: string): JobHandler {
  const handler = handlers.get(type);
  if (!handler) throw new Error(`Tipo de job sin handler: ${type}`);
  return handler;
}

// Handler de prueba de Fase 0: solo registra que se ejecutó. Se quitará en Fase 1.
registerHandler("noop", async () => {
  console.log("[worker] job noop procesado");
});
