// Shared helper for calling the Anthropic Messages API directly.
// Reads ANTHROPIC_API_KEY from the environment (SaaS master-key model — tenants
// do not supply their own key for the LLM).
//
// Docs: https://docs.anthropic.com/en/api/messages

// Prefer the current first-party Claude Sonnet API ID. Older Claude 3.5 IDs and
// aliases can disappear from individual Anthropic workspaces, so `callAnthropic`
// falls back to the Models API on 404 and retries with an available Sonnet model.
export const ANTHROPIC_DEFAULT_MODEL = "claude-sonnet-4-5";
const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_MODELS_URL = "https://api.anthropic.com/v1/models?limit=1000";
const ANTHROPIC_VERSION = "2023-06-01";

const FALLBACK_MODEL_CANDIDATES = [
  ANTHROPIC_DEFAULT_MODEL,
  "claude-sonnet-4-5-20250929",
  "claude-opus-4-1",
  "claude-opus-4-1-20250805",
  "claude-sonnet-4-0",
  "claude-haiku-4-5",
];

let cachedAvailableModel: string | null = null;

export interface AnthropicMessage {
  role: "user" | "assistant";
  content: string;
}

export interface AnthropicCallInput {
  system: string;
  messages: AnthropicMessage[];
  model?: string;
  max_tokens?: number;
  temperature?: number;
}

export interface AnthropicCallResult {
  ok: true;
  text: string;
  raw: unknown;
}

export interface AnthropicCallError {
  ok: false;
  status: number;
  error: string;
  code: "missing_key" | "rate_limit" | "credits" | "auth" | "server" | "unknown";
}

function classifyAnthropicError(status: number): AnthropicCallError["code"] {
  if (status === 429) return "rate_limit";
  if (status === 402) return "credits";
  if (status === 401 || status === 403) return "auth";
  if (status >= 500) return "server";
  return "unknown";
}

function isModelNotFound(status: number, errText: string): boolean {
  return status === 404 && /not_found_error|model:/i.test(errText);
}

async function listAvailableAnthropicModels(key: string): Promise<string[]> {
  try {
    const resp = await fetch(ANTHROPIC_MODELS_URL, {
      method: "GET",
      headers: {
        "x-api-key": key,
        "anthropic-version": ANTHROPIC_VERSION,
      },
    });
    if (!resp.ok) return [];
    const data = await resp.json();
    const models = Array.isArray(data?.data) ? data.data : [];
    return models
      .map((m: any) => (typeof m?.id === "string" ? m.id : null))
      .filter((id: string | null): id is string => Boolean(id));
  } catch (_error) {
    return [];
  }
}

async function resolveFallbackModel(key: string, attemptedModel: string): Promise<string | null> {
  if (cachedAvailableModel && cachedAvailableModel !== attemptedModel) return cachedAvailableModel;

  const availableModels = await listAvailableAnthropicModels(key);
  const availableSet = new Set(availableModels);
  const preferredFromCatalog = [
    ...FALLBACK_MODEL_CANDIDATES,
    ...availableModels.filter((id) => /sonnet/i.test(id)),
    ...availableModels,
  ];

  const model = preferredFromCatalog.find((candidate) => candidate !== attemptedModel && (
    availableSet.size === 0 || availableSet.has(candidate)
  ));

  cachedAvailableModel = model ?? null;
  return cachedAvailableModel;
}

async function postAnthropicMessage(key: string, body: Record<string, unknown>): Promise<Response> {
  return await fetch(ANTHROPIC_URL, {
    method: "POST",
    headers: {
      "x-api-key": key,
      "anthropic-version": ANTHROPIC_VERSION,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

/**
 * Normaliza uma lista de mensagens no formato OpenAI (que pode conter role="system")
 * para o formato da Anthropic (apenas user/assistant, sistema vai no campo `system`
 * do request). Concatena mensagens consecutivas do mesmo papel para garantir a
 * alternância exigida pela API.
 */
export function toAnthropicMessages(
  input: Array<{ role: string; content: string }>,
): AnthropicMessage[] {
  const cleaned: AnthropicMessage[] = [];
  for (const m of input) {
    if (!m || typeof m.content !== "string") continue;
    const role = m.role === "assistant" ? "assistant" : m.role === "user" ? "user" : null;
    if (!role) continue; // drop system/tool/etc — o sistema vai fora
    const last = cleaned[cleaned.length - 1];
    if (last && last.role === role) {
      last.content = `${last.content}\n\n${m.content}`;
    } else {
      cleaned.push({ role, content: m.content });
    }
  }
  // Anthropic exige que a primeira mensagem seja do user.
  if (cleaned.length && cleaned[0].role !== "user") {
    cleaned.unshift({ role: "user", content: "(início da conversa)" });
  }
  return cleaned;
}

export async function callAnthropic(
  input: AnthropicCallInput,
): Promise<AnthropicCallResult | AnthropicCallError> {
  const key = Deno.env.get("ANTHROPIC_API_KEY");
  if (!key) {
    return {
      ok: false,
      status: 500,
      error: "ANTHROPIC_API_KEY ausente nas variáveis de ambiente",
      code: "missing_key",
    };
  }

  const body: Record<string, unknown> = {
    model: input.model || ANTHROPIC_DEFAULT_MODEL,
    max_tokens: input.max_tokens ?? 1024,
    system: input.system,
    messages: input.messages,
  };

  let resp: Response;
  try {
    resp = await postAnthropicMessage(key, body);
  } catch (e) {
    return {
      ok: false,
      status: 502,
      error: `Falha de rede ao chamar Anthropic: ${(e as Error).message}`,
      code: "server",
    };
  }

  if (!resp.ok) {
    const errText = await resp.text().catch(() => "");

    if (isModelNotFound(resp.status, errText)) {
      const fallbackModel = await resolveFallbackModel(key, String(body.model));
      if (fallbackModel) {
        const retryBody = { ...body, model: fallbackModel };
        const retryResp = await postAnthropicMessage(key, retryBody);
        if (retryResp.ok) {
          const data = await retryResp.json();
          const parts = Array.isArray(data?.content) ? data.content : [];
          const text = parts
            .filter((p: any) => p?.type === "text" && typeof p.text === "string")
            .map((p: any) => p.text)
            .join("")
            .trim();

          return { ok: true, text, raw: data };
        }

        const retryErrText = await retryResp.text().catch(() => "");
        return {
          ok: false,
          status: retryResp.status,
          error: `Anthropic ${retryResp.status}: ${retryErrText.slice(0, 500)}`,
          code: classifyAnthropicError(retryResp.status),
        };
      }
    }

    const code = classifyAnthropicError(resp.status);
    return {
      ok: false,
      status: resp.status,
      error: `Anthropic ${resp.status}: ${errText.slice(0, 500)}`,
      code,
    };
  }

  const data = await resp.json();
  // Response shape: { content: [{ type: "text", text: "..." }, ...], ... }
  const parts = Array.isArray(data?.content) ? data.content : [];
  const text = parts
    .filter((p: any) => p?.type === "text" && typeof p.text === "string")
    .map((p: any) => p.text)
    .join("")
    .trim();

  return { ok: true, text, raw: data };
}
