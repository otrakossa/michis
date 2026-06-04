import type { AgentTool } from "./types.js";
import { supabase } from "../../supabase.js";

export function similitudTool(excludeCaseId: string): AgentTool {
  return {
    name: "similitud_texto",
    description:
      "Busca en la base de casos del colectivo otros casos con notas/contenido textual " +
      "similar al texto dado. Una similitud alta entre cuentas distintas sugiere " +
      "copypasta o granja de bots.",
    input_schema: {
      type: "object",
      properties: { texto: { type: "string" } },
      required: ["texto"],
    },
    execute: async (input) => {
      const { data, error } = await supabase.rpc("find_similar_cases", {
        p_texto: String(input.texto),
        p_exclude_case: excludeCaseId,
      });
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  };
}
