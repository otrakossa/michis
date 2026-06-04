import { describe, it, expect } from "vitest";
import { registerHandler, getHandler, handlerExists } from "../src/handlers.js";

describe("registro de handlers", () => {
  it("registra y recupera un handler por tipo", async () => {
    const calls: string[] = [];
    registerHandler("demo", async (payload) => {
      calls.push(JSON.stringify(payload));
    });

    expect(handlerExists("demo")).toBe(true);
    const handler = getHandler("demo");
    await handler({ hola: "mundo" });
    expect(calls).toEqual(['{"hola":"mundo"}']);
  });

  it("lanza si el tipo no tiene handler", () => {
    expect(() => getHandler("inexistente")).toThrow(/sin handler/);
  });
});
