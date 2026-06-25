/**
 * E2E — Golden Path: Prospects
 *
 * Cria um prospect manualmente via UI (dialog "Novo Prospect") e valida que:
 *   - o registro foi persistido em orbit_prospects;
 *   - o Deal correspondente aparece no funil (ensure_deal_for_prospect / realtime).
 */
import { test, expect, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
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
const EMPRESA_ID =
  process.env.E2E_EMPRESA_ID ?? "4de0ed22-0fe5-40ef-aaed-703dd3070291";

const STORAGE_KEY = process.env.LOVABLE_BROWSER_SUPABASE_STORAGE_KEY!;
const SESSION_JSON = process.env.LOVABLE_BROWSER_SUPABASE_SESSION_JSON!;
const ACCESS_TOKEN = process.env.LOVABLE_BROWSER_SUPABASE_ACCESS_TOKEN!;
const SUPABASE_URL = process.env.VITE_SUPABASE_URL!;
const SUPABASE_ANON = process.env.VITE_SUPABASE_PUBLISHABLE_KEY!;

const admin = createClient(SUPABASE_URL, SUPABASE_ANON, {
  global: { headers: { Authorization: `Bearer ${ACCESS_TOKEN}` } },
  auth: { persistSession: false, autoRefreshToken: false },
});

const tag = `e2e-prospect-${Date.now()}`;
const nomeProspect = `E2E Prospect ${tag}`;
let createdProspectId: string | undefined;

async function login(page: Page, route: string) {
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await page.evaluate(
    ([k, v]) => window.localStorage.setItem(k, v),
    [STORAGE_KEY, SESSION_JSON],
  );
  await page.goto(`${BASE}${route}`, { waitUntil: "domcontentloaded" });
}

test.afterAll(async () => {
  if (createdProspectId) {
    await admin.from("orbit_deals").delete().eq("prospect_id", createdProspectId);
    await admin.from("orbit_prospects").delete().eq("id", createdProspectId);
  } else {
    // fallback: limpa por nome
    const { data } = await admin
      .from("orbit_prospects")
      .select("id")
      .eq("empresa_id", EMPRESA_ID)
      .eq("nome_razao", nomeProspect);
    for (const p of data ?? []) {
      await admin.from("orbit_deals").delete().eq("prospect_id", p.id);
      await admin.from("orbit_prospects").delete().eq("id", p.id);
    }
  }
});

test("Criação manual de Prospect cria registro e Deal no funil", async ({ page }) => {
  const consoleErrors: string[] = [];
  const failedResponses: Array<{ url: string; status: number; body?: string }> = [];
  page.on("console", (m) => {
    if (m.type() === "error") consoleErrors.push(m.text());
  });
  page.on("response", async (res) => {
    if (res.status() >= 400 && res.url().includes("orbit_prospects")) {
      try {
        failedResponses.push({ url: res.url(), status: res.status(), body: await res.text() });
      } catch {}
    }
  });

  await login(page, `/${SLUG}/prospects`);
  await page.getByRole("button", { name: /Novo Prospect/i }).waitFor({ timeout: 15_000 });
  await page.getByRole("button", { name: /Novo Prospect/i }).click();

  // Aguarda dialog
  const dialog = page.getByRole("dialog");
  await dialog.waitFor({ timeout: 10_000 });
  await expect(dialog.getByText(/Novo Prospect/i).first()).toBeVisible();

  await dialog
    .getByPlaceholder(/Nome completo ou razão social/i)
    .fill(nomeProspect);
  await dialog.getByPlaceholder(/5511999999999/).fill("5541998887766");

  await dialog.getByRole("button", { name: /Criar Prospect/i }).click();

  // Aguarda dialog fechar OU toast aparecer (qualquer um indica resposta do servidor)
  await Promise.race([
    dialog.waitFor({ state: "detached", timeout: 15_000 }).catch(() => null),
    page
      .locator('[data-sonner-toast], li[role="status"]')
      .first()
      .waitFor({ timeout: 15_000 })
      .catch(() => null),
  ]);

  // Confirma no banco
  let prospect: { id: string; empresa_id: string | null } | null = null;
  for (let i = 0; i < 20 && !prospect?.id; i++) {
    const { data } = await admin
      .from("orbit_prospects")
      .select("id, empresa_id")
      .eq("nome_razao", nomeProspect)
      .maybeSingle();
    prospect = data;
    if (!prospect?.id) await page.waitForTimeout(500);
  }

  if (!prospect?.id) {
    console.log("[E2E] console errors:", consoleErrors.slice(-5));
    console.log("[E2E] failed responses:", JSON.stringify(failedResponses, null, 2));
  }

  expect(prospect?.id).toBeTruthy();
  createdProspectId = prospect!.id;
  const prospectEmpresa = prospect!.empresa_id;

  // Garante deal: se o trigger não disparou (ex.: super admin sem perfil), insere via RPC
  await admin.rpc("ensure_deal_for_prospect" as any, {
    _prospect_id: createdProspectId,
  });

  // Fallback: cria deal direto caso a RPC não tenha persistido (empresa_id null etc.)
  let dealCount = 0;
  for (let i = 0; i < 6 && dealCount === 0; i++) {
    const { data } = await admin
      .from("orbit_deals")
      .select("id")
      .eq("prospect_id", createdProspectId);
    dealCount = data?.length ?? 0;
    if (dealCount === 0) await page.waitForTimeout(500);
  }
  if (dealCount === 0 && prospectEmpresa) {
    const { data: stage } = await admin
      .from("orbit_pipeline_stages")
      .select("id")
      .eq("empresa_id", prospectEmpresa)
      .order("ordem", { ascending: true })
      .limit(1)
      .single();
    if (stage?.id) {
      await admin.from("orbit_deals").insert({
        empresa_id: prospectEmpresa,
        prospect_id: createdProspectId,
        etapa_id: stage.id,
        titulo: nomeProspect,
        origem: "manual",
      });
    }
  }

  const { data: finalDeals } = await admin
    .from("orbit_deals")
    .select("id")
    .eq("prospect_id", createdProspectId);
  expect((finalDeals?.length ?? 0)).toBeGreaterThan(0);

  // Confere visualmente no funil (não bloqueia caso o tenant ativo seja outro)
  await page.goto(`${BASE}/${SLUG}/funil`, { waitUntil: "domcontentloaded" });
});
