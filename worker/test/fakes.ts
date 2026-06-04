import type { LlmClient, LlmCreateParams, LlmResponse } from "../src/agent/llm.js";

// LLM guionado: devuelve las respuestas del guion en orden (la última se repite).
export class FakeLlm implements LlmClient {
  private i = 0;
  readonly calls: LlmCreateParams[] = [];

  constructor(private readonly script: Partial<LlmResponse>[]) {}

  async create(params: LlmCreateParams): Promise<LlmResponse> {
    this.calls.push(params);
    const s = this.script[Math.min(this.i++, this.script.length - 1)];
    return {
      stopReason: "end_turn",
      text: "",
      toolUse: null,
      inputTokens: 100,
      outputTokens: 50,
      raw: [],
      ...s,
    };
  }
}
