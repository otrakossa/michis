// Única fuente de etiquetas humanas. Los valores crudos del enum no se muestran.
export const ESTADO_CASO: Record<string, string> = {
  nuevo: "recién cargado",
  investigando: "la IA está investigando…",
  needs_review: "esperando tu revisión",
  confirmado: "confirmado ✓",
  descartado: "descartado",
};

export const ESTADO_DOSSIER: Record<string, string> = {
  draft: "borrador — editable",
  listo_admin: "pendiente de admin",
  approved: "aprobado",
};

export const ESTADO_RUN: Record<string, string> = {
  queued: "en cola",
  running: "investigando…",
  needs_review: "lista para revisar",
  done: "terminada",
  failed: "falló",
};

export function etiquetaEstado(mapa: Record<string, string>, estado: string): string {
  return mapa[estado] ?? estado;
}

export function fraseVeredicto(score: number): string {
  if (score > 70) return "Muy probablemente es una cuenta sintética";
  if (score >= 40) return "Hay señales sospechosas";
  return "Pocas señales de bot";
}
