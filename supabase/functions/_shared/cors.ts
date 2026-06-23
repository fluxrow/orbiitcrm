const STATIC_ALLOWED_ORIGINS = [
  "https://app.orbiitcrm.com.br",
  "https://orbiitcrm.lovable.app",
  "https://orbit.fluxrow.pro",
  Deno.env.get("APP_URL") ?? "",
].filter(Boolean);

const ALLOWED_ORIGIN_PATTERNS: RegExp[] = [
  /^https?:\/\/localhost(:\d+)?$/,
  /^https?:\/\/127\.0\.0\.1(:\d+)?$/,
  /^https:\/\/[a-z0-9-]+\.lovable\.app$/,
  /^https:\/\/[a-z0-9-]+\.lovableproject\.com$/,
  /^https:\/\/[a-z0-9-]+\.sandbox\.lovable\.dev$/,
];

function isAllowedOrigin(origin: string): boolean {
  if (!origin) return false;
  if (STATIC_ALLOWED_ORIGINS.includes(origin)) return true;
  return ALLOWED_ORIGIN_PATTERNS.some((re) => re.test(origin));
}

export const DEFAULT_ALLOW_HEADERS =
  "authorization, x-client-info, apikey, content-type";

interface CorsOptions {
  allowHeaders?: string;
}

export function getCorsHeaders(
  req?: Request,
  options: CorsOptions = {},
): Record<string, string> {
  const origin = req?.headers.get("Origin") ?? "";
  const fallbackOrigin =
    Deno.env.get("APP_URL") ?? STATIC_ALLOWED_ORIGINS[0] ?? "*";

  return {
    "Access-Control-Allow-Origin": isAllowedOrigin(origin) ? origin : fallbackOrigin,
    "Access-Control-Allow-Headers": options.allowHeaders ?? DEFAULT_ALLOW_HEADERS,
    "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
    Vary: "Origin",
  };
}

export function corsOptionsResponse(
  req?: Request,
  options: CorsOptions = {},
): Response {
  return new Response(null, {
    headers: getCorsHeaders(req, options),
  });
}
