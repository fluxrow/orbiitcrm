import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(__dirname, path), "utf8");
const conversas = read("../pages/orbit/ConversasPage.tsx");
const deals = read("../hooks/useOrbitDeals.ts");

describe("tenant client context wave 3.6", () => {
  it("fails closed when conversation media does not match the route tenant", () => {
    expect(conversas).toContain("conversaEmpresaId !== empresaId");
    expect(conversas).toContain("Conversa fora do contexto de tenant ativo");
    const uploadSection = conversas.slice(conversas.indexOf("const uploadFile"), conversas.indexOf("const handleFileSelect"));
    expect(uploadSection).not.toContain('.from("profiles")');
  });

  it("scopes deal realtime channels and events by the route tenant", () => {
    expect(deals).toContain("orbit_deals_realtime:${empresaId}");
    expect(deals).toContain("filter: `empresa_id=eq.${empresaId}`");
    expect(deals).toContain("[empresaId, queryClient]");
  });
});
