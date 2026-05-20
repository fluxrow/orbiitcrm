import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: { getUser: vi.fn() },
    from: vi.fn(),
    rpc: vi.fn(),
    channel: vi.fn(),
    removeChannel: vi.fn(),
  },
}));

import { parseCSV } from "@/hooks/useImportProspects";

declare global {
  var Deno:
    | {
        env: {
          get: (key: string) => string | undefined;
        };
      }
    | undefined;
}

describe("orbit smoke", () => {
  afterEach(() => {
    vi.resetModules();
    delete globalThis.Deno;
  });

  it("normalizes imported phone fields during CSV parsing", () => {
    const csv = [
      "nome_razao;email;telefone;whatsapp",
      "Empresa Exemplo;contato@exemplo.com;(11) 99999-9999;",
      "Empresa Dois;dois@exemplo.com;;(11) 3456-7890",
    ].join("\n");

    const { prospects, errors } = parseCSV(csv);

    expect(errors).toEqual([]);
    expect(prospects).toHaveLength(2);
    expect(prospects[0]).toMatchObject({
      nome_razao: "Empresa Exemplo",
      telefone: undefined,
      whatsapp: "5511999999999",
      whatsapp_status: "nao_verificado",
    });
    expect(prospects[1]).toMatchObject({
      nome_razao: "Empresa Dois",
      whatsapp: "551134567890",
      whatsapp_status: "nao_verificado",
    });
  });

  it("returns restricted cors headers for allowed and fallback origins", async () => {
    globalThis.Deno = {
      env: {
        get: (key: string) =>
          key === "APP_URL" ? "https://staging.orbiitcrm.com.br" : undefined,
      },
    };

    const { getCorsHeaders } = await import("../../supabase/functions/_shared/cors.ts");

    const allowedHeaders = getCorsHeaders(
      new Request("https://edge.local", {
        headers: { Origin: "https://app.orbiitcrm.com.br" },
      }),
    );
    const fallbackHeaders = getCorsHeaders(
      new Request("https://edge.local", {
        headers: { Origin: "https://malicious.example" },
      }),
    );

    expect(allowedHeaders["Access-Control-Allow-Origin"]).toBe(
      "https://app.orbiitcrm.com.br",
    );
    expect(fallbackHeaders["Access-Control-Allow-Origin"]).toBe(
      "https://staging.orbiitcrm.com.br",
    );
    expect(fallbackHeaders.Vary).toBe("Origin");
  }, 15000);
});
