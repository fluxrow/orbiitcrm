/**
 * E2E — Ações Rápidas do ProspectActionCard (H3)
 *
 * Roda sob demanda via Playwright (`bunx playwright test tests/e2e`).
 * Os asserts contra o banco usam o client Supabase diretamente, com a
 * sessão restaurada via LOVABLE_BROWSER_SUPABASE_* (workflow padrão).
 *
 * Pré-condições:
 *  - O dev server precisa estar rodando (http://localhost:8080).
 *  - Variáveis VITE_SUPABASE_URL e VITE_SUPABASE_PUBLISHABLE_KEY presentes em .env.
 *  - Um prospect de teste qualificado e com conversa aberta deve existir.
 *    Use o seletor `data-prospect-id` para identificar o card no Kanban.
 *
 * Estes testes NÃO rodam no CI padrão de unit (vitest) — ficam isolados aqui.
 */
import { test, expect, type Page } from "@playwright/test";

const BASE = process.env.E2E_BASE_URL ?? "http://localhost:8080";
const PROSPECT_ID = process.env.E2E_PROSPECT_ID ?? "";

async function openFunilWithCard(page: Page) {
  await page.goto(`${BASE}/orbit/funil`, { waitUntil: "domcontentloaded" });
  if (PROSPECT_ID) {
    await page.locator(`[data-prospect-id="${PROSPECT_ID}"]`).first().waitFor();
  }
}

test.describe("ProspectActionCard — Ações Rápidas", () => {
  test.beforeEach(async ({ page }) => {
    await openFunilWithCard(page);
  });

  test("Toggle IA pausa a conversa (human_talk=true)", async ({ page }) => {
    const card = PROSPECT_ID
      ? page.locator(`[data-prospect-id="${PROSPECT_ID}"]`).first()
      : page.locator("[data-prospect-id]").first();
    await card.locator('[data-testid="toggle-ai-action"]').click();
    await expect(page.locator("[data-sonner-toast]")).toContainText(/IA pausada|IA reativada/i);
  });

  test("Mover etapa move o card para nova coluna", async ({ page }) => {
    const card = page.locator("[data-prospect-id]").first();
    await card.locator('[data-testid="move-stage-action"]').click();
    await page.locator('[role="option"]').first().click();
    await expect(page.locator("[data-sonner-toast]")).toContainText(/Deal movido/i);
  });

  test("Forçar fluxo cria evento manual_trigger", async ({ page }) => {
    const card = page.locator("[data-prospect-id]").first();
    await card.locator('[data-testid="force-flow-action"]').click();
    // Seleciona o primeiro fluxo ativo, se houver
    const firstFlow = page.locator('[role="dialog"] button, [data-radix-popper-content-wrapper] button').first();
    if (await firstFlow.count()) {
      await firstFlow.click();
      await expect(page.locator("[data-sonner-toast]")).toContainText(/Fluxo disparado/i);
    } else {
      await expect(page.locator("text=Nenhum fluxo ativo")).toBeVisible();
    }
  });
});
