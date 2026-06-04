import { describe, it, expect } from "vitest";
import { normalizeHandle, isValidHandle } from "../lib/handle";

describe("normalizeHandle", () => {
  it("quita @ inicial, espacios y pasa a minúsculas", () => {
    expect(normalizeHandle(" @Bot_X ")).toBe("bot_x");
  });
  it("quita múltiples @ iniciales", () => {
    expect(normalizeHandle("@@cuenta")).toBe("cuenta");
  });
  it("deja igual un handle ya normalizado", () => {
    expect(normalizeHandle("granja_123")).toBe("granja_123");
  });
});

describe("isValidHandle", () => {
  it("acepta letras, números, guion bajo y punto", () => {
    expect(isValidHandle("bot_x.2")).toBe(true);
  });
  it("rechaza vacío", () => {
    expect(isValidHandle("")).toBe(false);
  });
  it("rechaza espacios y acentos", () => {
    expect(isValidHandle("a b")).toBe(false);
    expect(isValidHandle("cuentaá")).toBe(false);
  });
  it("rechaza más de 30 caracteres", () => {
    expect(isValidHandle("a".repeat(31))).toBe(false);
  });
});
