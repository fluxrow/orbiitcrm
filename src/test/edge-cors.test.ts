import { beforeAll, describe, expect, it, vi } from "vitest";

beforeAll(() => {
  vi.stubGlobal("Deno", {
    env: { get: () => undefined },
  });
});

describe("Edge Function CORS", () => {
  it("allows the idempotency header used by manual message sends", async () => {
    const { optionsResponse } = await import(
      "../../supabase/functions/_shared/responses.ts"
    );
    const request = new Request(
      "https://example.supabase.co/functions/v1/orbit-send-message",
      {
        method: "OPTIONS",
        headers: { Origin: "https://orbit.fluxrow.pro" },
      },
    );

    const response = optionsResponse(request);
    const allowedHeaders = response.headers
      .get("Access-Control-Allow-Headers")
      ?.toLowerCase()
      .split(",")
      .map((header) => header.trim());

    expect(allowedHeaders).toContain("idempotency-key");
  });
});
