import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const configPage = readFileSync(resolve(__dirname, "../pages/orbit/ConfigPage.tsx"), "utf8");
const orbitConfigHook = readFileSync(resolve(__dirname, "../hooks/useOrbitConfig.ts"), "utf8");

function saveZapiBlock() {
  const start = configPage.indexOf("const saveZAPI = async ()");
  expect(start).toBeGreaterThan(-1);
  const end = configPage.indexOf("const saveResendApiKey", start);
  return configPage.slice(start, end);
}

describe("Z-API config save (toggle ativo)", () => {
  it("persiste exatamente o valor do toggle, nunca forçando true", () => {
    const block = saveZapiBlock();
    expect(block).toContain("ativo: zapiForm.ativo");
    expect(block).not.toContain("ativo: true");
  });

  it("usa fallback no estado local baseado no toggle, não em true", () => {
    const block = saveZapiBlock();
    expect(block).toContain("saved.ativo ?? zapiForm.ativo");
    expect(block).not.toContain("saved.ativo ?? true");
  });

  it("informa no toast se ficou ativa ou desativada", () => {
    const block = saveZapiBlock();
    expect(block).toMatch(/integração ativa/i);
    expect(block).toMatch(/integração desativada/i);
  });

  it("salvar credenciais não toca em envio_real_liberado", () => {
    expect(saveZapiBlock()).not.toContain("envio_real_liberado");
    expect(orbitConfigHook).not.toContain("envio_real_liberado");
  });
});

describe("simulação do payload de salvamento", () => {
  // Replica a regra corrigida: o payload deve refletir o toggle do formulário.
  const buildPayload = (form: { ativo: boolean }) => ({ ativo: form.ativo });

  it("envia false quando o toggle está desligado", () => {
    expect(buildPayload({ ativo: false }).ativo).toBe(false);
  });

  it("envia true quando o toggle está ligado", () => {
    expect(buildPayload({ ativo: true }).ativo).toBe(true);
  });
});
