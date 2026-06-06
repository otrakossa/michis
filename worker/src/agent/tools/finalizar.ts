import type { AgentTool } from "./types.js";

export const FINALIZAR = "finalizar_investigacion";

export interface Veredicto {
  score: number;
  confianza: "baja" | "media" | "alta";
  senales: { tipo: string; descripcion: string; peso: number }[];
  cuentas_vinculadas: {
    handle: string;
    relacion: "mismo_texto" | "amplificacion_coordinada" | "mismo_avatar";
    razon: string;
  }[];
  resumen: string;
  modo_degradado: boolean;
}

export function finalizarTool(): AgentTool {
  return {
    name: FINALIZAR,
    description:
      "Termina la investigación entregando el veredicto final. DEBES llamarla cuando tengas " +
      "suficiente evidencia o cuando se te indique cerrar. Sé riguroso: señales con peso " +
      "honesto; si la evidencia es débil, score bajo y confianza baja. IMPORTANTE: score es " +
      "un ENTERO de 0 a 100 (probabilidad porcentual de cuenta sintética). NUNCA uses escala " +
      "0-5 ni 0-10: una cuenta muy sospechosa es ~85, no 4.5.",
    input_schema: {
      type: "object",
      properties: {
        score: {
          type: "number",
          minimum: 0,
          maximum: 100,
          description: "entero 0-100: probabilidad porcentual de cuenta sintética",
        },
        confianza: { enum: ["baja", "media", "alta"] },
        senales: {
          type: "array",
          items: {
            type: "object",
            properties: {
              tipo: { type: "string" },
              descripcion: { type: "string" },
              peso: { type: "number", minimum: 1, maximum: 5 },
            },
            required: ["tipo", "descripcion", "peso"],
          },
        },
        cuentas_vinculadas: {
          type: "array",
          items: {
            type: "object",
            properties: {
              handle: { type: "string" },
              relacion: { enum: ["mismo_texto", "amplificacion_coordinada", "mismo_avatar"] },
              razon: { type: "string" },
            },
            required: ["handle", "relacion", "razon"],
          },
        },
        resumen: { type: "string", description: "borrador de expediente en markdown" },
        modo_degradado: { type: "boolean" },
      },
      required: ["score", "confianza", "senales", "cuentas_vinculadas", "resumen", "modo_degradado"],
    },
    // Nunca se ejecuta: el runtime intercepta esta tool y cierra el bucle.
    execute: async () => null,
  };
}
