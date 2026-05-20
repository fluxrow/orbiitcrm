const ALLOWED_ORIGINS = [
  "https://app.orbiitcrm.com.br",
  Deno.env.get("APP_URL") ?? "",
].filter(Boolean);

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
    Deno.env.get("APP_URL") ?? ALLOWED_ORIGINS[0] ?? "https://app.orbiitcrm.com.br";

  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGINS.includes(origin)
      ? origin
      : fallbackOrigin,
    "Access-Control-Allow-Headers": options.allowHeaders ?? DEFAULT_ALLOW_HEADERS,
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
