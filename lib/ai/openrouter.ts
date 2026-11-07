const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const DEFAULT_TIMEOUT_MS = 20_000;

export type OpenRouterFailureReason =
  | "unconfigured"
  | "rate_limited"
  | "authentication"
  | "credits"
  | "routing"
  | "timeout"
  | "unavailable"
  | "invalid_response";

export type OpenRouterResult =
  | { ok: true; value: unknown }
  | { ok: false; reason: OpenRouterFailureReason };

export interface StructuredCompletionRequest {
  schemaName: string;
  schema: Record<string, unknown>;
  systemPrompt: string;
  userPrompt: string;
  sessionId?: string;
}

export interface OpenRouterClient {
  completeStructured(request: StructuredCompletionRequest): Promise<OpenRouterResult>;
}

export interface OpenRouterClientOptions {
  fetchImpl?: typeof fetch;
  apiKey?: string;
  model?: string;
  timeoutMs?: number;
}

/** Server-only client. Never return or log provider credentials or raw errors. */
export function createOpenRouterClient(options: OpenRouterClientOptions = {}): OpenRouterClient {
  return {
    async completeStructured(request): Promise<OpenRouterResult> {
      const apiKey = options.apiKey ?? process.env.OPENROUTER_API_KEY;
      const model = options.model ?? process.env.OPENROUTER_MODEL;
      if (!apiKey || !model) return { ok: false, reason: "unconfigured" };

      // Luna's currently available route accepts JSON objects but rejects the
      // strict-schema/require_parameters combination. Keep server validation
      // authoritative; JSON mode alone does not establish schema compliance.
      const jsonObjectMode = ["openai/gpt-6-luna", "openai/gpt-6-luna-pro", "~openai/gpt-luna-latest"].includes(model);
      const systemPrompt = `${request.systemPrompt}\nReturn a JSON data object that conforms to this schema, not the schema itself. No markdown, commentary, or extra properties.\nJSON schema (${request.schemaName}):\n${JSON.stringify(request.schema)}`;

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
      try {
        const response = await (options.fetchImpl ?? fetch)(OPENROUTER_URL, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model,
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: request.userPrompt },
            ],
            temperature: 0,
            max_tokens: 4_000,
            session_id: request.sessionId,
            ...(jsonObjectMode ? {} : { provider: { require_parameters: true } }),
            response_format: jsonObjectMode ? { type: "json_object" } : {
              type: "json_schema",
              json_schema: {
                name: request.schemaName,
                strict: true,
                schema: request.schema,
              },
            },
          }),
          signal: controller.signal,
        });

        if (response.status === 429) return { ok: false, reason: "rate_limited" };
        if (response.status === 401 || response.status === 403) return { ok: false, reason: "authentication" };
        if (response.status === 402) return { ok: false, reason: "credits" };
        if (response.status === 404) return { ok: false, reason: "routing" };
        if (!response.ok) return { ok: false, reason: "unavailable" };

        const payload: unknown = await response.json();
        const content = readContent(payload);
        if (content === null) return { ok: false, reason: "invalid_response" };
        try {
          return { ok: true, value: JSON.parse(content) as unknown };
        } catch {
          return { ok: false, reason: "invalid_response" };
        }
      } catch {
        return { ok: false, reason: controller.signal.aborted ? "timeout" : "unavailable" };
      } finally {
        clearTimeout(timeout);
      }
    },
  };
}

function readContent(payload: unknown): string | null {
  if (!isRecord(payload) || !Array.isArray(payload.choices) || payload.choices.length === 0) return null;
  const choice = payload.choices[0];
  if (!isRecord(choice) || choice.finish_reason === "length" || !isRecord(choice.message) || typeof choice.message.content !== "string") return null;
  return choice.message.content;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
