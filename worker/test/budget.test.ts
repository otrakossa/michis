import { describe, it, expect } from "vitest";
import { Budget } from "../src/agent/budget.js";

describe("Budget", () => {
  it("calcula USD según precios de sonnet (3/15 por millón)", () => {
    const b = new Budget(10);
    b.add(1_000_000, 0);
    expect(b.costUsd).toBeCloseTo(3);
    b.add(0, 1_000_000);
    expect(b.costUsd).toBeCloseTo(18);
  });

  it("acumula tokens y detecta el tope", () => {
    const b = new Budget(0.5);
    b.add(100_000, 10_000); // 0.30 + 0.15 = 0.45
    expect(b.totalTokens).toBe(110_000);
    expect(b.exceeded).toBe(false);
    b.add(20_000, 0); // +0.06 → 0.51
    expect(b.exceeded).toBe(true);
  });
});
