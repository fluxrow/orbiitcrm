/**
 * E2E F2 — Importador Inteligente de CSV
 * Testa o caminho feliz do wizard usando o módulo de parsing/import diretamente
 * contra o Supabase (sem precisar de UI). Esse formato é rápido o suficiente
 * para integrar no Mutirão E2E.
 */
import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || "https://oqsnzwkiwgqwopuaugxj.supabase.co";
const SUPABASE_KEY = process.env.VITE_SUPABASE_PUBLISHABLE_KEY!;

const sample = `Nome da Empresa;Email;WhatsApp;CNPJ;Cidade;UF;Faturamento Mensal;Desafio Atual
Mentoria Alpha;contato.alpha+test@example.com;5511988880001;11.222.333/0001-81;São Paulo;SP;R$ 50k;Captação
Coach Beta;beta.test@example.com;5511988880002;12345678901;Rio de Janeiro;RJ;R$ 100k;Engajamento
Lead Sem Email;;5511988880003;;Curitiba;PR;R$ 20k;Diferenciação`;

test.describe("F2 — Wizard de Importação CSV", () => {
  test("processa CSV com campos dinâmicos e detecta CPF/CNPJ", async ({ page }) => {
    await page.goto("http://localhost:8080/");
    await expect(page).toHaveURL(/.+/);

    // Carrega os módulos do app via import dinâmico no contexto do browser
    const result = await page.evaluate(async ({ url, key, csv }) => {
      const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2");
      const supa = createClient(url, key);

      // Importa os helpers via fetch ao bundle Vite (path absoluto resolvido pelo dev server)
      const mod = await import("/src/hooks/useImportWizard.ts");
      const parsed = mod.parseCsvFile(csv);
      const built = mod.buildRecordsFromMapping(parsed.headers, parsed.rows, parsed.autoMapping);

      return {
        headers: parsed.headers,
        rowCount: parsed.rows.length,
        autoMapping: parsed.autoMapping,
        records: built.records.map((r: any) => ({
          nome_razao: r.nome_razao,
          cnpj_cpf: r.cnpj_cpf,
          tipo_documento: r.tipo_documento,
          extras: r.dados_adicionais,
          whatsapp: r.whatsapp,
          email: r.email_principal,
        })),
        rowErrors: built.rowErrors,
      };
    }, { url: SUPABASE_URL, key: SUPABASE_KEY, csv: sample });

    expect(result.rowCount).toBe(3);
    expect(result.headers).toContain("Faturamento Mensal");
    expect(result.records.length).toBeGreaterThanOrEqual(2);

    // Documento PJ correto
    const alpha = result.records.find(r => r.nome_razao === "Mentoria Alpha")!;
    expect(alpha.cnpj_cpf).toBe("11222333000181");
    expect(alpha.tipo_documento).toBe("PJ");
    expect(alpha.extras["Faturamento Mensal"]).toBe("R$ 50k");
    expect(alpha.extras["Desafio Atual"]).toBe("Captação");

    // Documento PF (CPF) detectado
    const beta = result.records.find(r => r.nome_razao === "Coach Beta")!;
    expect(beta.cnpj_cpf?.length).toBe(11);

    // Linha sem email mas com whatsapp continua válida
    const lead3 = result.records.find(r => r.whatsapp === "5511988880003")!;
    expect(lead3).toBeTruthy();
  });
});
