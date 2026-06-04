// Precios de claude-sonnet-4-6 en USD por millón de tokens.
const INPUT_USD_PER_M = 3;
const OUTPUT_USD_PER_M = 15;

export class Budget {
  private spent = 0;
  private tokens = 0;

  constructor(private readonly limitUsd: number) {}

  add(inputTokens: number, outputTokens: number): void {
    this.tokens += inputTokens + outputTokens;
    this.spent +=
      (inputTokens * INPUT_USD_PER_M + outputTokens * OUTPUT_USD_PER_M) / 1_000_000;
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
