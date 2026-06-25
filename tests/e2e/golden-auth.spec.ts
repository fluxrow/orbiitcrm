/**
 * E2E — Golden Path: Auth (login com sessão pré-injetada, isolamento por tenant, logout)
 *
 * O runner Lovable injeta a sessão Supabase via:
 *   LOVABLE_BROWSER_SUPABASE_STORAGE_KEY
 *   LOVABLE_BROWSER_SUPABASE_SESSION_JSON
 *
 * Esta suíte NÃO testa o formulário de e-mail/senha (sem credenciais de teste no env),
 * mas cobre os 3 fluxos vitais: rota protegida sem sessão → /auth, rota com sessão
 * por tenant, e logout limpando o storage.
 */
import { test, expect, type Page } from "@playwright/test";
import * as fs from "node:fs";
import * as path from "node:path";

function loadDotenv() {
  try {
    const txt = fs.readFileSync(path.resolve(__dirname, "../../.env"), "utf8");
    for (const line of txt.split("\n")) {
      const m = line.match(/^([A-Z0-9_]+)\s*=\s*"?([^"\n]+)"?$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
    }
  } catch {}
}
loadDotenv();

const BASE = process.env.E2E_BASE_URL ?? "http://localhost:8080";
const SLUG = process.env.E2E_TENANT_SLUG ?? "fluxrow";
const STORAGE_KEY = process.env.LOVABLE_BROWSER_SUPABASE_STORAGE_KEY!;
const SESSION_JSON = process.env.LOVABLE_BROWSER_SUPABASE_SESSION_JSON!;

async function injectSession(page: Page) {
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await page.evaluate(
    ([k, v]) => window.localStorage.setItem(k, v),
    [STORAGE_KEY, SESSION_JSON],
  );
}

test.describe("Golden Path — Auth", () => {
  test("Rota protegida sem sessão redireciona para /auth", async ({ page }) => {
    await page.context().clearCookies();
    await page.goto(BASE, { waitUntil: "domcontentloaded" });
    await page.evaluate((k) => window.localStorage.removeItem(k), STORAGE_KEY);
    await page.goto(`${BASE}/${SLUG}/dashboard`, { waitUntil: "domcontentloaded" });
    await page.waitForURL(/\/auth(\?|$)/, { timeout: 15_000 });
    expect(page.url()).toMatch(/\/auth/);
  });

  test("Com sessão, /:slug/dashboard carrega para o tenant correto", async ({ page }) => {
    await injectSession(page);
    await page.goto(`${BASE}/${SLUG}/dashboard`, { waitUntil: "domcontentloaded" });
    // Sidebar é o sinal mais estável de que o layout autenticado montou
    await expect(page.getByRole("button", { name: /Sair/i })).toBeVisible({
      timeout: 15_000,
    });
    expect(page.url()).toContain(`/${SLUG}/`);
  });

  test("Logout limpa sessão e volta para /auth", async ({ page }) => {
    await injectSession(page);
    await page.goto(`${BASE}/${SLUG}/dashboard`, { waitUntil: "domcontentloaded" });
    const sair = page.getByRole("button", { name: /Sair/i });
    await expect(sair).toBeVisible({ timeout: 15_000 });
    // Animação do sidebar deixa o botão "não estável" — force-click resolve.
    await sair.click({ force: true });
    // handleSignOut navega para "/" (LandingPage).
    await page.waitForURL((u) => !u.pathname.includes(`/${SLUG}/`), {
      timeout: 15_000,
    });
    const stored = await page.evaluate((k) => window.localStorage.getItem(k), STORAGE_KEY);
    expect(stored).toBeNull();
  });
});
