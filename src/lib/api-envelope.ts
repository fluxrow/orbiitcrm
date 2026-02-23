import { toast } from "sonner";

// ── Types ──

export interface ApiSuccess<T = any> {
  ok: true;
  data: T;
  meta?: {
    simulated?: boolean;
    correlation_id?: string;
    reason?: string;
    [key: string]: unknown;
  };
}

export interface ApiErrorPayload {
  code: string;
  message: string;
  details?: Record<string, any>;
  correlation_id?: string;
}

export interface ApiFailure {
  ok: false;
  error: ApiErrorPayload;
}

export type ApiResponse<T = any> = ApiSuccess<T> | ApiFailure;

// ── Error class for typed error handling in catch blocks ──

export class ApiError extends Error {
  public code: string;
  public details?: Record<string, any>;
  public correlationId?: string;

  constructor(payload: ApiErrorPayload) {
    super(payload.message);
    this.name = "ApiError";
    this.code = payload.code;
    this.details = payload.details;
    this.correlationId = payload.correlation_id;
  }
}

// ── Plan/limit error codes that trigger the PlanLimitDialog ──

const PLAN_LIMIT_CODES = new Set([
  "PLAN_FEATURE_DISABLED",
  "PLAN_LIMIT_REACHED",
  "PLAN_STATUS_BLOCKED",
  "TRIAL_EXPIRED",
  "NO_PLAN",
  "DEMO_RATE_LIMIT",
  "DEMO_ACTION_BLOCKED",
]);

// ── Provider error codes ──

const PROVIDER_CODES = new Set([
  "PROVIDER_NOT_CONFIGURED",
  "PROVIDER_AUTH_FAILED",
  "PROVIDER_RATE_LIMIT",
  "PROVIDER_SEND_FAILED",
]);

// ── Core functions ──

/**
 * Parse the response from `supabase.functions.invoke()` into a typed envelope.
 *
 * Handles three cases:
 *   1. Transport error (`response.error` is set by Supabase SDK)
 *   2. New envelope format (`response.data.ok === true/false`)
 *   3. Legacy format (any JSON without `ok` field — wraps as success)
 */
export function parseResponse<T = any>(response: {
  data: any;
  error: any;
}): ApiResponse<T> {
  // Transport-level error from the SDK
  if (response.error) {
    return {
      ok: false,
      error: {
        code: "INTERNAL_ERROR",
        message: response.error.message || "Erro de comunicação com o servidor",
      },
    };
  }

  const d = response.data;

  // Standard envelope
  if (d && typeof d === "object" && "ok" in d) {
    return d as ApiResponse<T>;
  }

  // Legacy edge function response: { error: "..." } or { success: true, ... }
  if (d && typeof d === "object") {
    if (d.error) {
      return {
        ok: false,
        error: {
          code: d.code || "INTERNAL_ERROR",
          message: typeof d.error === "string" ? d.error : d.error.message || "Erro desconhecido",
          details: d.details,
        },
      };
    }
    // Treat everything else as success data
    return { ok: true, data: d as T } as ApiSuccess<T>;
  }

  return { ok: true, data: d as T } as ApiSuccess<T>;
}

export interface HandleOptions {
  /** Called when ok=true and meta.simulated=true */
  onSimulated?: () => void;
  /** Called when error code is a plan limit */
  onPlanLimit?: (code: string, error: ApiErrorPayload) => void;
  /** Called when error code is a provider issue */
  onProviderMissing?: (code: string, error: ApiErrorPayload) => void;
  /** Don't show "Envio simulado" toast automatically */
  silentSimulated?: boolean;
}

/**
 * Unified handler for edge function responses.
 *
 * - On success with simulated=true: shows toast (unless silentSimulated)
 * - On plan/limit error: calls onPlanLimit callback
 * - On any error: throws ApiError for mutation's onError handler
 * - On success: returns `data`
 */
export function handleApiResponse<T = any>(
  response: { data: any; error: any },
  options?: HandleOptions,
): T {
  const parsed = parseResponse<T>(response);

  if (parsed.ok) {
    // Simulated demo send
    if (parsed.meta?.simulated) {
      if (!options?.silentSimulated) {
        toast.info("Envio simulado (Demo)", {
          description: "No modo demo, envios são simulados sem custo.",
        });
      }
      options?.onSimulated?.();
    }
    return parsed.data;
  }

  // Error path — parsed.ok is false here, so error is guaranteed
  const apiErr = (parsed as ApiFailure).error;

  // Plan/limit errors
  if (PLAN_LIMIT_CODES.has(apiErr.code)) {
    options?.onPlanLimit?.(apiErr.code, apiErr);
    throw new ApiError(apiErr);
  }

  // Provider errors
  if (PROVIDER_CODES.has(apiErr.code)) {
    options?.onProviderMissing?.(apiErr.code, apiErr);
    throw new ApiError(apiErr);
  }

  // Generic error
  throw new ApiError(apiErr);
}

/**
 * Check if an error (from catch block) is a plan limit error.
 * Works with both new ApiError and legacy errors.
 */
export function isPlanLimitError(err: unknown): string | null {
  if (err instanceof ApiError && PLAN_LIMIT_CODES.has(err.code)) {
    return err.code;
  }
  // Legacy fallback
  const code = (err as any)?.code || (err as any)?.reason;
  if (code && PLAN_LIMIT_CODES.has(code)) return code;
  const msg = typeof err === "string" ? err : (err as any)?.message || (err as any)?.error;
  if (msg && PLAN_LIMIT_CODES.has(msg)) return msg;
  return null;
}
