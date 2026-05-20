/**
 * Standard API Envelope for all Edge Functions.
 *
 * Success: { ok: true, data: T, meta: { correlation_id, simulated?, ... } }
 * Error:   { ok: false, error: { code, message, details?, correlation_id } }
 */

import { getCorsHeaders } from "./cors.ts";

const ALLOW_HEADERS =
  "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version";

// ── Error codes ──

export const ErrorCodes = {
  // SaaS / Plans
  PLAN_FEATURE_DISABLED: "PLAN_FEATURE_DISABLED",
  PLAN_LIMIT_REACHED: "PLAN_LIMIT_REACHED",
  PLAN_STATUS_BLOCKED: "PLAN_STATUS_BLOCKED",
  TRIAL_EXPIRED: "TRIAL_EXPIRED",
  NO_PLAN: "NO_PLAN",

  // Demo / Sandbox
  DEMO_RATE_LIMIT: "DEMO_RATE_LIMIT",
  DEMO_ACTION_BLOCKED: "DEMO_ACTION_BLOCKED",

  // Invites / Onboarding
  INVITE_INVALID: "INVITE_INVALID",
  INVITE_EXPIRED: "INVITE_EXPIRED",
  INVITE_USED: "INVITE_USED",

  // CNPJ
  CNPJ_INVALID: "CNPJ_INVALID",
  CNPJ_ALREADY_EXISTS: "CNPJ_ALREADY_EXISTS",
  CNPJ_LOOKUP_FAILED: "CNPJ_LOOKUP_FAILED",

  // Integrations
  PROVIDER_NOT_CONFIGURED: "PROVIDER_NOT_CONFIGURED",
  PROVIDER_AUTH_FAILED: "PROVIDER_AUTH_FAILED",
  PROVIDER_RATE_LIMIT: "PROVIDER_RATE_LIMIT",
  PROVIDER_SEND_FAILED: "PROVIDER_SEND_FAILED",

  // Auth
  UNAUTHORIZED: "UNAUTHORIZED",
  FORBIDDEN: "FORBIDDEN",

  // Generic
  VALIDATION_ERROR: "VALIDATION_ERROR",
  NOT_FOUND: "NOT_FOUND",
  INTERNAL_ERROR: "INTERNAL_ERROR",
} as const;

export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes];

// ── Helpers ──

function makeCorrelationId(): string {
  return crypto.randomUUID();
}

/** Standard CORS preflight response */
export function optionsResponse(req?: Request): Response {
  return new Response(null, {
    headers: getCorsHeaders(req, { allowHeaders: ALLOW_HEADERS }),
  });
}

/** Success envelope */
export function ok(
  data: unknown = {},
  meta?: Record<string, unknown>,
  req?: Request,
): Response {
  const correlationId = makeCorrelationId();
  return new Response(
    JSON.stringify({
      ok: true,
      data,
      meta: { correlation_id: correlationId, ...meta },
    }),
    {
      status: 200,
      headers: {
        ...getCorsHeaders(req, { allowHeaders: ALLOW_HEADERS }),
        "Content-Type": "application/json",
      },
    },
  );
}

/** Error envelope */
export function fail(
  code: string,
  message: string,
  status = 400,
  details?: Record<string, unknown>,
  req?: Request,
): Response {
  const correlationId = makeCorrelationId();
  return new Response(
    JSON.stringify({
      ok: false,
      error: {
        code,
        message,
        details: details || undefined,
        correlation_id: correlationId,
      },
    }),
    {
      status,
      headers: {
        ...getCorsHeaders(req, { allowHeaders: ALLOW_HEADERS }),
        "Content-Type": "application/json",
      },
    },
  );
}

/**
 * Maps a `saas_can_use()` RPC result to either:
 * - null → allowed, continue processing
 * - Response → denied, return this immediately
 *
 * If sandbox=true and denied, returns ok() with meta.simulated=true.
 */
export function fromPlanCheck(
  canUseResult: any,
  sandbox = false,
  req?: Request,
): Response | null {
  if (!canUseResult || canUseResult.allowed !== false) {
    return null; // allowed
  }

  const reason = canUseResult.reason as string;
  const details = {
    plan_code: canUseResult.plan_code,
    current: canUseResult.current,
    limit: canUseResult.limit,
    remaining: canUseResult.remaining,
  };

  // Map RPC reason to our error codes
  const codeMap: Record<string, string> = {
    PLAN_LIMIT: ErrorCodes.PLAN_LIMIT_REACHED,
    FEATURE_DISABLED: ErrorCodes.PLAN_FEATURE_DISABLED,
    TRIAL_EXPIRED: ErrorCodes.TRIAL_EXPIRED,
    SUSPENDED: ErrorCodes.PLAN_STATUS_BLOCKED,
    NO_PLAN: ErrorCodes.NO_PLAN,
  };

  const code = codeMap[reason] || reason;

  // In sandbox mode, return simulated success instead of hard error
  if (sandbox && (reason === "PLAN_LIMIT" || reason === "FEATURE_DISABLED")) {
    return ok({}, { simulated: true, reason: "demo_sandbox" }, req);
  }

  const messageMap: Record<string, string> = {
    PLAN_LIMIT_REACHED:
      "Você atingiu o limite mensal do seu plano para esta funcionalidade.",
    PLAN_FEATURE_DISABLED:
      "Seu plano atual não inclui esta funcionalidade.",
    TRIAL_EXPIRED: "Seu período de teste expirou.",
    PLAN_STATUS_BLOCKED: "Sua conta está suspensa.",
    NO_PLAN: "Sua empresa não possui um plano ativo.",
  };

  return fail(code, messageMap[code] || reason, 403, details, req);
}

/** Maps third-party provider errors to standard envelope */
export function mapProviderError(
  err: any,
  provider: string,
  req?: Request,
): Response {
  const message =
    err?.error?.message || err?.message || `Erro ao comunicar com ${provider}`;

  // Rate limit from provider
  if (err?.status === 429 || err?.statusCode === 429) {
    return fail(
      ErrorCodes.PROVIDER_RATE_LIMIT,
      `${provider}: limite de taxa excedido. Tente novamente mais tarde.`,
      429,
      undefined,
      req,
    );
  }

  // Auth error from provider
  if (err?.status === 401 || err?.statusCode === 401 || err?.status === 403) {
    return fail(
      ErrorCodes.PROVIDER_AUTH_FAILED,
      `${provider}: falha de autenticação. Verifique as credenciais.`,
      502,
      undefined,
      req,
    );
  }

  return fail(ErrorCodes.PROVIDER_SEND_FAILED, message, 502, {
    provider,
    original_status: err?.status || err?.statusCode,
  }, req);
}
