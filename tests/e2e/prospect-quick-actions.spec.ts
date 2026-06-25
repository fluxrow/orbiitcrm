/**
 * E2E — Ações Rápidas do ProspectActionCard (H3)
 *
 * Reqs ENV (injetados pelo runner Lovable):
 *   LOVABLE_BROWSER_SUPABASE_STORAGE_KEY
 *   LOVABLE_BROWSER_SUPABASE_SESSION_JSON
 *   LOVABLE_BROWSER_SUPABASE_ACCESS_TOKEN
 *   VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY (.env)
 *
 * Opcionais:
 *   E2E_BASE_URL        default http://localhost:8080
 *   E2E_TENANT_SLUG     default fluxrow
 *   E2E_EMPRESA_ID      default 4de0ed22-0fe5-40ef-aaed-703dd3070291 (Fluxrow)
 *
 * Cria seed isolado (prospect qualificado + conversa aberta + fluxo ativo),
 * roda os 3 cenários, e limpa tudo no afterAll.
 */
import { test, expect, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import * as fs from "node:fs";
import * as path from "node:path";

// --- ENV bootstrap (lê .env do projeto manualmente) ---
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

// Estado do seed
let prospectId = "";
let conversaId = "";
let flowId = "";
const tag = `e2e-${Date.now()}`;

test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  // 1) Prospect qualificado
  const { data: p, error: pe } = await admin
    .from("orbit_prospects")
    .insert({
      empresa_id: EMPRESA_ID,
      tipo: "pessoa",
      nome_razao: `E2E Lead ${tag}`,
      telefone: "+5541999990000",
      whatsapp: "+5541999990000",
      whatsapp_status: "valido",
      email_principal: `${tag}@example.com`,
      status_qualificacao: "qualificado",
      score: 90,
      origem_contato: "PROSPECTS",
    })
    .select("id")
    .single();
  if (pe) throw new Error(`seed prospect: ${pe.message}`);
  prospectId = p!.id;

  // garante deal no funil
  await admin.rpc("ensure_deal_for_prospect" as any, {
    _prospect_id: prospectId,
  });

  // 2) Conversa aberta
  const { data: c, error: ce } = await admin
    .from("orbit_conversas")
    .insert({
      empresa_id: EMPRESA_ID,
      prospect_id: prospectId,
      canal: "whatsapp",
      status: "aberta",
      human_talk: false,
      telefone_whatsapp: "+5541999990000",
    })
    .select("id")
    .single();
  if (ce) throw new Error(`seed conversa: ${ce.message}`);
  conversaId = c!.id;

  // 3) Flow ativo manual_trigger
  const { data: f, error: fe } = await admin
    .from("orbit_flows")
    .insert({
      empresa_id: EMPRESA_ID,
      nome: `E2E Flow ${tag}`,
      trigger_type: "prospect_qualified",
      ativo: true,
    })
    .select("id")
    .single();
  if (fe) throw new Error(`seed flow: ${fe.message}`);
  flowId = f!.id;
});

test.afterAll(async () => {
  if (flowId) await admin.from("orbit_flows").delete().eq("id", flowId);
  if (prospectId) {
    await admin
      .from("orbit_flow_events")
      .delete()
      .eq("entity_id", prospectId);
    await admin.from("orbit_deals").delete().eq("prospect_id", prospectId);
  }
  if (conversaId) await admin.from("orbit_conversas").delete().eq("id", conversaId);
  if (prospectId) await admin.from("orbit_prospects").delete().eq("id", prospectId);
});

async function login(page: Page) {
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await page.evaluate(
    ([k, v]) => window.localStorage.setItem(k, v),
    [STORAGE_KEY, SESSION_JSON],
  );
  await page.goto(`${BASE}/${SLUG}/prospects`, { waitUntil: "domcontentloaded" });
  await page.locator(`[data-prospect-id="${prospectId}"]`).first().waitFor({
    timeout: 15000,
  });
  await page.locator(`[data-prospect-id="${prospectId}"]`).first().scrollIntoViewIfNeeded();
}

test.describe("ProspectActionCard — Ações Rápidas", () => {
  // ─── Toggle IA ────────────────────────────────────────────────
  test("Toggle IA pausa a conversa (human_talk=true)", async ({ page }) => {
    await login(page);
    const card = page.locator(`[data-prospect-id="${prospectId}"]`).first();
    await card.locator('[data-testid="toggle-ai-action"]').click();
    await expect(
      page.locator('[data-sonner-toast], li[role="status"]').first(),
    ).toContainText(/IA pausada|IA reativada/i, { timeout: 8000 });
    const { data } = await admin
      .from("orbit_conversas")
      .select("human_talk")
      .eq("id", conversaId)
      .single();
    expect(data?.human_talk).toBe(true);
  });

  test("Toggle IA reativa a conversa (human_talk=false)", async ({ page }) => {
    // garante estado prévio = pausada
    await admin
      .from("orbit_conversas")
      .update({ human_talk: true })
      .eq("id", conversaId);
    await login(page);
    const card = page.locator(`[data-prospect-id="${prospectId}"]`).first();
    await card.locator('[data-testid="toggle-ai-action"]').click();
    await expect(
      page.locator('[data-sonner-toast], li[role="status"]').first(),
    ).toContainText(/IA reativada/i, { timeout: 8000 });
    const { data } = await admin
      .from("orbit_conversas")
      .select("human_talk")
      .eq("id", conversaId)
      .single();
    expect(data?.human_talk).toBe(false);
  });

  // ─── Mover etapa ──────────────────────────────────────────────
  test("Popover de etapas lista todas as etapas do pipeline", async ({ page }) => {
    await login(page);
    const card = page.locator(`[data-prospect-id="${prospectId}"]`).first();
    await card.locator('[data-testid="move-stage-action"]').click();
    const popover = page.locator("[data-radix-popper-content-wrapper]").last();
    await expect(popover).toContainText(/Mover para etapa/i);
    await popover.getByRole("combobox").click();

    const listbox = page.getByRole("listbox");
    const { data: stages } = await admin
      .from("orbit_pipeline_stages")
      .select("nome, ordem")
      .eq("empresa_id", EMPRESA_ID)
      .order("ordem");
    expect(stages && stages.length).toBeGreaterThan(0);
    for (const s of stages ?? []) {
      await expect(listbox.getByRole("option", { name: s.nome })).toBeVisible();
    }
  });

  test("Mover etapa atualiza orbit_deals.etapa_id", async ({ page }) => {
    await login(page);
    const card = page.locator(`[data-prospect-id="${prospectId}"]`).first();
    await card.locator('[data-testid="move-stage-action"]').click();
    const popover = page.locator("[data-radix-popper-content-wrapper]").last();
    await popover.getByRole("combobox").click();
    await page.getByRole("option", { name: "Qualificação" }).click();
    await expect(
      page.locator('[data-sonner-toast], li[role="status"]').first(),
    ).toContainText(/Deal movido/i, { timeout: 8000 });

    const { data: stage } = await admin
      .from("orbit_pipeline_stages")
      .select("id")
      .eq("empresa_id", EMPRESA_ID)
      .eq("nome", "Qualificação")
      .single();
    const { data: deal } = await admin
      .from("orbit_deals")
      .select("etapa_id")
      .eq("prospect_id", prospectId)
      .single();
    expect(deal?.etapa_id).toBe(stage?.id);
  });

  // ─── Forçar fluxo ────────────────────────────────────────────
  test("Popover de fluxos lista apenas fluxos ativos da empresa", async ({ page }) => {
    await login(page);
    const card = page.locator(`[data-prospect-id="${prospectId}"]`).first();
    await card.locator('[data-testid="force-flow-action"]').click();
    const popover = page.locator("[data-radix-popper-content-wrapper]").last();
    await expect(popover).toContainText(/Forçar fluxo/i);

    const { data: activeFlows } = await admin
      .from("orbit_flows")
      .select("nome")
      .eq("empresa_id", EMPRESA_ID)
      .eq("ativo", true);
    expect(activeFlows && activeFlows.length).toBeGreaterThan(0);
    for (const f of activeFlows ?? []) {
      await expect(popover.getByRole("button", { name: f.nome })).toBeVisible();
    }
  });

  test("Forçar fluxo cria evento manual_trigger no banco", async ({ page }) => {
    await login(page);
    const card = page.locator(`[data-prospect-id="${prospectId}"]`).first();
    await card.locator('[data-testid="force-flow-action"]').click();
    const popover = page.locator("[data-radix-popper-content-wrapper]").last();
    await popover.getByRole("button", { name: new RegExp(`E2E Flow ${tag}`) }).click();
    await expect(
      page.locator('[data-sonner-toast], li[role="status"]').first(),
    ).toContainText(/Fluxo disparado/i, { timeout: 8000 });

    const { data } = await admin
      .from("orbit_flow_events")
      .select("event_type, payload")
      .eq("entity_id", prospectId)
      .order("created_at", { ascending: false })
      .limit(5);
    const manual = (data ?? []).find(
      (e: any) => e.payload?.manual_trigger === true,
    );
    expect(manual).toBeTruthy();
    expect((manual?.payload as any)?.forced_flow_id).toBe(flowId);
  });
});

