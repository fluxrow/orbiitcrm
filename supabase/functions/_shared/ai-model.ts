/**
 * Normalização do identificador de modelo do agente.
 *
 * DOCUMENTADO: o runtime do Orbit (`_shared/anthropic.ts`) chama a Anthropic
 * Messages API diretamente. Identificadores de outros vendors
 * (`google/gemini-*`, `openai/gpt-*`) NÃO são aceitos pela API e resultariam em
 * 404 (`not_found_error: model`). Portanto, `orbit_ai_config.modelo_ia` é
 * normalizado para o identificador Anthropic equivalente por tier:
 *
 *   gemini/gpt *pro | *opus            -> claude-opus-4-1
 *   gemini/gpt *flash (2.5/3.x), gpt-5 -> claude-sonnet-4-5   (padrão)
 *   *flash-lite | *nano | *mini | haiku-> claude-haiku-4-5
 *
 * Valores já Anthropic (`claude-*`) passam intactos. Vazio -> default.
 */

import { ANTHROPIC_DEFAULT_MODEL } from "./anthropic.ts";

export const ALLOWED_ANTHROPIC_MODELS = [
  "claude-sonnet-4-5",
  "claude-sonnet-4-5-20250929",
  "claude-opus-4-1",
  "claude-opus-4-1-20250805",
  "claude-sonnet-4-0",
  "claude-haiku-4-5",
] as const;

export function normalizeAgentModel(input: string | null | undefined): string {
  const raw = String(input ?? "").trim();
  if (!raw) return ANTHROPIC_DEFAULT_MODEL;
  if ((ALLOWED_ANTHROPIC_MODELS as readonly string[]).includes(raw)) return raw;
  const lower = raw.toLowerCase();
  // Qualquer outro claude-* é repassado (a Anthropic faz a validação final e o
  // callAnthropic já tem fallback via /v1/models).
  if (lower.startsWith("claude")) return raw;

  if (/flash-?lite|-nano|-mini|haiku/.test(lower)) return "claude-haiku-4-5";
  if (/pro|opus/.test(lower)) return "claude-opus-4-1";
  return ANTHROPIC_DEFAULT_MODEL;
}
