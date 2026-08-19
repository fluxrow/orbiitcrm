import { createClient } from "https://esm.sh/@supabase/supabase-js@2.108.2";
import { getCorsHeaders } from "../_shared/cors.ts";

const SECTIONS = new Set([
  "summary", "agenda", "whatsapp", "ai_handoff", "queues",
  "media", "alerts", "audit", "capabilities", "health",
]);

const RATE_WINDOW_MS = 60_000;
const RATE_LIMITS: Record<string, number> = { audit: 20, default: 60 };
const rateBuckets = new Map<string, { count: number; resetAt: number }>();

function json(req: Request, body: unknown, status = 200, requestId = crypto.randomUUID()) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...getCorsHeaders(req),
      "Content-Type": "application/json",
      "Cache-Control": "private, no-store",
      "X-Request-Id": requestId,
    },
  });
}

function failure(req: Request, requestId: string, code: string, message: string, status: number, retryable = false) {
  return json(req, { ok: false, error: { code, message, request_id: requestId, retryable } }, status, requestId);
}

function checkRateLimit(userId: string, section: string) {
  const now = Date.now();
  const key = `${userId}:${section}`;
  const limit = RATE_LIMITS[section] ?? RATE_LIMITS.default;
  const current = rateBuckets.get(key);
  if (!current || current.resetAt <= now) {
    rateBuckets.set(key, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return true;
  }
  if (current.count >= limit) return false;
  current.count += 1;
  return true;
}

// Defense in depth. The database contract already excludes these fields.
function removeSensitiveKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(removeSensitiveKeys);
  if (!value || typeof value !== "object") return value;
  const blocked = /^(access_token|refresh_token|token|client_token|api_key|secret|payload|telefone_whatsapp)$/i;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([key]) => !blocked.test(key))
      .map(([key, item]) => [key, removeSensitiveKeys(item)]),
  );
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: getCorsHeaders(req) });

  const requestId = crypto.randomUUID();
  if (req.method !== "GET") {
    return failure(req, requestId, "INVALID_QUERY", "Somente GET é permitido.", 405);
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return failure(req, requestId, "UNAUTHENTICATED", "Sessão obrigatória.", 401);
  }

  const section = new URL(req.url).searchParams.get("section") ?? "summary";
  if (!SECTIONS.has(section)) {
    return failure(req, requestId, "INVALID_QUERY", "Seção inválida.", 400);
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false } },
    );

    const token = authHeader.slice("Bearer ".length);
    const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);
    const userId = claimsData?.claims?.sub as string | undefined;
    if (claimsError || !userId) {
      return failure(req, requestId, "UNAUTHENTICATED", "Sessão inválida ou expirada.", 401);
    }

    if (!checkRateLimit(userId, section)) {
      return failure(req, requestId, "RATE_LIMITED", "Limite temporário de consultas excedido.", 429, true);
    }

    // Tenant context is read from the authenticated user's profile. No tenant id,
    // slug or impersonation target is accepted from query params or request body.
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("empresa_id")
      .eq("id", userId)
      .maybeSingle();

    if (profileError) {
      return failure(req, requestId, "DATA_SOURCE_UNAVAILABLE", "Não foi possível resolver o tenant.", 503, true);
    }
    if (!profile?.empresa_id) {
      return failure(req, requestId, "TENANT_CONTEXT_MISSING", "Nenhum tenant ativo foi encontrado na sessão.", 409);
    }

    const { data, error } = await supabase.rpc("orbit_tenant_ops_read", { p_section: section });
    if (error) {
      const raw = `${error.code ?? ""} ${error.message ?? ""}`.toLowerCase();
      if (raw.includes("feature_disabled") || error.code === "42501") {
        return failure(req, requestId, "FEATURE_DISABLED", "Centro de Operações não habilitado para este tenant.", 403);
      }
      if (raw.includes("tenant_context_missing")) {
        return failure(req, requestId, "TENANT_CONTEXT_MISSING", "Tenant ativo não encontrado.", 409);
      }
      if (raw.includes("invalid_section")) {
        return failure(req, requestId, "INVALID_QUERY", "Seção inválida.", 400);
      }
      console.error(JSON.stringify({ request_id: requestId, section, code: error.code }));
      return failure(req, requestId, "DATA_SOURCE_UNAVAILABLE", "Dados operacionais temporariamente indisponíveis.", 503, true);
    }

    return json(req, {
      ok: true,
      data: removeSensitiveKeys(data),
      meta: {
        tenant_id: profile.empresa_id,
        generated_at: new Date().toISOString(),
        data_freshness: section === "health" ? "realtime" : "near_realtime",
        request_id: requestId,
        masked: true,
        partial: ["alerts", "audit", "media"].includes(section),
        warnings: [],
      },
    }, 200, requestId);
  } catch {
    return failure(req, requestId, "INTERNAL_ERROR", "Erro interno ao consultar o Centro de Operações.", 500, true);
  }
});
