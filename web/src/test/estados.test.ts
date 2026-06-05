import { describe, it, expect } from "vitest";
import { ESTADO_CASO, ESTADO_DOSSIER, ESTADO_RUN, etiquetaEstado, fraseVeredicto } from "../lib/estados";

describe("estados humanos", () => {
  it("traduce estados de caso", () => {
    expect(etiquetaEstado(ESTADO_CASO, "needs_review")).toBe("esperando tu revisión");
    expect(etiquetaEstado(ESTADO_CASO, "investigando")).toBe("la IA está investigando…");
  });
  it("traduce dossier y run", () => {
    expect(etiquetaEstado(ESTADO_DOSSIER, "draft")).toBe("borrador — editable");
    expect(etiquetaEstado(ESTADO_RUN, "failed")).toBe("falló");
  });
  it("cae al valor crudo si el estado es desconocido", () => {
    expect(etiquetaEstado(ESTADO_CASO, "raro")).toBe("raro");
  });
  it("frase del veredicto por rango de score", () => {
    expect(fraseVeredicto(85)).toMatch(/Muy probablemente/);
    expect(fraseVeredicto(55)).toMatch(/señales sospechosas/);
    expect(fraseVeredicto(20)).toMatch(/Pocas señales/);
  });
});
