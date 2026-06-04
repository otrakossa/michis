import Anthropic from "@anthropic-ai/sdk";

export interface LlmToolDef {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

export interface LlmResponse {
  stopReason: string | null;
  text: string; // razonamiento visible (bloques de texto concatenados)
  toolUse: { id: string; name: string; input: Record<string, unknown> } | null;
  inputTokens: number;
  outputTokens: number;
  raw: unknown; // bloques de contenido para reinyectar como turno assistant
}

export interface LlmCreateParams {
  system: string;
  messages: unknown[];
  tools: LlmToolDef[];
  forceTool?: string;
}

export interface LlmClient {
  create(params: LlmCreateParams): Promise<LlmResponse>;
}

export class AnthropicLlm implements LlmClient {
  private client: Anthropic;

  constructor(apiKey: string, private readonly model = "claude-sonnet-4-6") {
    this.client = new Anthropic({ apiKey });
  }

  async create({ system, messages, tools, forceTool }: LlmCreateParams): Promise<LlmResponse> {
    const resp = await this.client.messages.create({
      model: this.model,
      max_tokens: 2048,
      // Prompt caching: el system se paga una vez por ráfaga, no por vuelta.
      system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
      messages: messages as Anthropic.MessageParam[],
      tools: tools as unknown as Anthropic.Tool[],
      ...(forceTool ? { tool_choice: { type: "tool" as const, name: forceTool } } : {}),
    });
    // Cast necesario: ContentBlock es una unión amplia; solo accedemos a los campos
    // que existen en ToolUseBlock (.id, .name, .input) tras filtrar por type.
    const toolBlock = resp.content.find((b) => b.type === "tool_use") as
      | Anthropic.ToolUseBlock
      | undefined;
    return {
      stopReason: resp.stop_reason,
      text: resp.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("\n"),
      toolUse: toolBlock
        ? {
            id: toolBlock.id,
            name: toolBlock.name,
            input: toolBlock.input as Record<string, unknown>,
          }
        : null,
      inputTokens: resp.usage.input_tokens,
      outputTokens: resp.usage.output_tokens,
      raw: resp.content,
    };
  }
}
