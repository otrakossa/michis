import type { AgentTool } from "./types.js";
import type { XClient } from "../xclient.js";

export function perfilXTool(x: XClient): AgentTool {
  return {
    name: "perfil_x",
    description:
      "Obtiene el perfil público de una cuenta de X/Twitter: fecha de creación, métricas, " +
      "últimos tweets y horarios. Si devuelve disponible:false no hay acceso a la API de X " +
      "y debes investigar en modo degradado (decláralo en el veredicto).",
    input_schema: {
      type: "object",
      properties: { handle: { type: "string", description: "handle sin @" } },
      required: ["handle"],
    },
    execute: async (input) => x.getProfile(String(input.handle)),
  };
}
