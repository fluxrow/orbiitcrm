import { createClient } from "@supabase/supabase-js";
import {
  parseTimestamp,
  sha256Hex,
  utf8ByteLength,
  validateEnvelope,
  verifyHmac,
} from "./contract.ts";

const ALLOW_HEADERS = [
  "content-type",
  "idempotency-key",
  "x-stackdocs-connection",
  "x-stackdocs-signature",
  "x-stackdocs-timestamp",
].join(", ");

const MAX_BODY_BYTES = boundedEnv("STACKDOCS_INTAKE_MAX_BODY_BYTES", 1_048_576, 1_024, 5_242_880);
const CLOCK_SKEW_SECONDS = boundedEnv("STACKDOCS_INTAKE_CLOCK_SKEW_SECONDS", 300, 30, 900);
const RATE_LIMIT = boundedEnv("STACKDOCS_INTAKE_RATE_LIMIT_PER_MINUTE", 60, 1, 600);

function boundedEnv(name: string, fallback: number, minimum: number, maximum: number): number {
  const parsed = Number(Deno.env.get(name) ?? fallback);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(Math.floor(parsed), minimum), maximum);
}

function headers(extra: Record<string, string> = {}): HeadersInit {
  return {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": ALLOW_HEADERS,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    ...extra,
  };
}

function accepted(receiptId: string, duplicate: boolean, correlationId: string): Response {
  return new Response(JSON.stringify({
    ok: true,
    status: "accepted",
    receipt_id: receiptId,
    duplicate,
    correlation_id: correlationId,
  }), { status: 202, headers: headers() });
}

function failure(
  code: string,
  message: string,
  status: number,
  correlationId: string,
  retryable = false,
  extraHeaders: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify({
    ok: false,
    error: { code, message, retryable },
    correlation_id: correlationId,
  }), { status, headers: headers(extraHeaders) });
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response(null, { headers: headers() });
  const requestCorrelationId = crypto.randomUUID();
  if (request.method !== "POST") {
    return failure("METHOD_NOT_ALLOWED", "Método não permitido.", 405, requestCorrelationId);
  }

  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
    return failure("PAYLOAD_TOO_LARGE", "Payload acima do limite.", 413, requestCorrelationId);
  }

  const publicConnectionId = request.headers.get("x-stackdocs-connection") ?? "";
  const idempotencyKey = request.headers.get("idempotency-key") ?? "";
  if (!publicConnectionId || !idempotencyKey) {
    return failure("INVALID_REQUEST", "Headers obrigatórios ausentes.", 400, requestCorrelationId);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    return failure("INTAKE_UNAVAILABLE", "Intake temporariamente indisponível.", 503, requestCorrelationId, true);
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: connection, error: connectionError } = await admin
    .from("orbit_external_connections")
    .select("id, empresa_id, status, secret_env_key, previous_secret_env_key, previous_secret_valid_until")
    .eq("provider", "stackdocs")
    .eq("public_connection_id", publicConnectionId)
    .maybeSingle();

  if (connectionError) {
    console.error(JSON.stringify({ event: "stackdocs_connection_lookup_failed", correlation_id: requestCorrelationId, code: connectionError.code }));
    return failure("INTAKE_UNAVAILABLE", "Intake temporariamente indisponível.", 503, requestCorrelationId, true);
  }
  if (!connection) {
    return failure("AUTHENTICATION_REJECTED", "Autenticação rejeitada.", 401, requestCorrelationId);
  }
  if (connection.status !== "active") {
    return failure("CONNECTION_FORBIDDEN", "Conexão não autorizada.", 403, requestCorrelationId);
  }

  let rawBody: string;
  try {
    rawBody = await request.text();
  } catch {
    return failure("INVALID_REQUEST", "Não foi possível ler o payload.", 400, requestCorrelationId);
  }
  if (utf8ByteLength(rawBody) > MAX_BODY_BYTES) {
    return failure("PAYLOAD_TOO_LARGE", "Payload acima do limite.", 413, requestCorrelationId);
  }

  let timestamp: string;
  try {
    timestamp = parseTimestamp(request.headers.get("x-stackdocs-timestamp"), Date.now(), CLOCK_SKEW_SECONDS);
  } catch {
    return failure("AUTHENTICATION_REJECTED", "Autenticação rejeitada.", 401, requestCorrelationId);
  }

  const secrets = [Deno.env.get(connection.secret_env_key) ?? ""];
  if (
    connection.previous_secret_env_key &&
    connection.previous_secret_valid_until &&
    new Date(connection.previous_secret_valid_until).getTime() > Date.now()
  ) {
    secrets.push(Deno.env.get(connection.previous_secret_env_key) ?? "");
  }
  const usableSecrets = secrets.filter(Boolean);
  if (usableSecrets.length === 0) {
    console.error(JSON.stringify({ event: "stackdocs_secret_unavailable", correlation_id: requestCorrelationId }));
    return failure("INTAKE_UNAVAILABLE", "Intake temporariamente indisponível.", 503, requestCorrelationId, true);
  }
  if (!await verifyHmac(request.headers.get("x-stackdocs-signature"), timestamp, rawBody, usableSecrets)) {
    return failure("AUTHENTICATION_REJECTED", "Autenticação rejeitada.", 401, requestCorrelationId);
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
    validateEnvelope(payload);
  } catch {
    return failure("INVALID_ENVELOPE", "Envelope inválido.", 400, requestCorrelationId);
  }

  if (payload.connection_id !== publicConnectionId || payload.event_id !== idempotencyKey) {
    return failure("CONTRACT_MISMATCH", "Identidade do evento divergente.", 400, requestCorrelationId);
  }

  const payloadHash = await sha256Hex(rawBody);
  const { data, error } = await admin.rpc("orbit_stackdocs_accept_event", {
    p_connection_id: connection.id,
    p_payload_hash: payloadHash,
    p_payload: payload,
    p_rate_limit: RATE_LIMIT,
  });

  if (error) {
    const raw = `${error.code ?? ""} ${error.message ?? ""}`;
    if (raw.includes("EVENT_ID_PAYLOAD_CONFLICT")) {
      return failure("IDEMPOTENCY_CONFLICT", "Evento repetido com conteúdo divergente.", 409, payload.correlation_id);
    }
    if (raw.includes("STACKDOCS_RATE_LIMITED")) {
      return failure("RATE_LIMITED", "Limite temporário excedido.", 429, payload.correlation_id, true, { "Retry-After": "60" });
    }
    if (raw.includes("CONNECTION_NOT_ACTIVE") || raw.includes("STACKDOCS_FEATURE_DISABLED")) {
      return failure("CONNECTION_FORBIDDEN", "Conexão não autorizada.", 403, payload.correlation_id);
    }
    if (raw.includes("S1_APPLY_FLAG_MUST_REMAIN_DISABLED")) {
      console.error(JSON.stringify({ event: "stackdocs_s1_apply_guard_triggered", correlation_id: payload.correlation_id }));
      return failure("INTAKE_UNAVAILABLE", "Intake temporariamente indisponível.", 503, payload.correlation_id, true);
    }
    console.error(JSON.stringify({ event: "stackdocs_receipt_failed", correlation_id: payload.correlation_id, code: error.code }));
    return failure("INTAKE_UNAVAILABLE", "Recibo durável não confirmado.", 500, payload.correlation_id, true);
  }

  const result = data as { receipt_id?: string; duplicate?: boolean; correlation_id?: string } | null;
  if (!result?.receipt_id) {
    return failure("INTAKE_UNAVAILABLE", "Recibo durável não confirmado.", 500, payload.correlation_id, true);
  }
  return accepted(result.receipt_id, result.duplicate === true, result.correlation_id ?? payload.correlation_id);
});
