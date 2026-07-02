// Shared helper for calling the Anthropic Messages API directly.
// Reads ANTHROPIC_API_KEY from the environment (SaaS master-key model — tenants
// do not supply their own key for the LLM).
//
// Docs: https://docs.anthropic.com/en/api/messages

export const ANTHROPIC_DEFAULT_MODEL = "claude-3-5-sonnet-20240620";
const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";

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

  const body = {
    model: input.model || ANTHROPIC_DEFAULT_MODEL,
    max_tokens: input.max_tokens ?? 1024,
    temperature: input.temperature ?? 0.7,
    system: input.system,
    messages: input.messages,
  };

  let resp: Response;
  try {
    resp = await fetch(ANTHROPIC_URL, {
      method: "POST",
      headers: {
        "x-api-key": key,
        "anthropic-version": ANTHROPIC_VERSION,
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    });
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
    let code: AnthropicCallError["code"] = "unknown";
    if (resp.status === 429) code = "rate_limit";
    else if (resp.status === 402) code = "credits";
    else if (resp.status === 401 || resp.status === 403) code = "auth";
    else if (resp.status >= 500) code = "server";
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
