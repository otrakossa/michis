// Contador de gasto del agente. Defaults: precios de claude-sonnet-4-6 en USD
// por millón de tokens; configurables por proveedor (0 para tiers gratuitos).
export class Budget {
  private spent = 0;
  private tokens = 0;

  constructor(
    private readonly limitUsd: number,
    private readonly inputUsdPerM = 3,
    private readonly outputUsdPerM = 15,
  ) {}

  add(inputTokens: number, outputTokens: number): void {
    this.tokens += inputTokens + outputTokens;
    this.spent +=
      (inputTokens * this.inputUsdPerM + outputTokens * this.outputUsdPerM) / 1_000_000;
  }

  get costUsd(): number {
    return this.spent;
  }
  get totalTokens(): number {
    return this.tokens;
  }
  get exceeded(): boolean {
    return this.spent >= this.limitUsd;
  }
}
