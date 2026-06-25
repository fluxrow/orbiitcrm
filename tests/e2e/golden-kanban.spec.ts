/**
 * E2E — Golden Path: Kanban (Drag & Drop de Deal entre colunas)
 *
 * Seed: 1 prospect + 1 deal na primeira etapa do pipeline da empresa.
 * Ação: dispara eventos HTML5 dragstart/dragover/drop (os handlers em
 *       FunilPage.tsx são onDragStart/onDragOver/onDrop nativos).
 * Validação: orbit_deals.etapa_id muda para o id da coluna destino.
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

const tag = `e2e-kanban-${Date.now()}`;
let prospectId = "";
let dealId = "";
let stageFrom: { id: string; nome: string } | null = null;
let stageTo: { id: string; nome: string } | null = null;

test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  // pega duas primeiras etapas (não-won) do pipeline
  const { data: stages, error: stagesErr } = await admin
    .from("orbit_pipeline_stages")
    .select("id, nome, ordem, is_won")
    .eq("empresa_id", EMPRESA_ID)
    .order("ordem", { ascending: true });
  if (stagesErr || !stages || stages.length < 2) {
    throw new Error("Pipeline com menos de 2 etapas — impossível testar drag");
  }
  const nonWon = stages.filter((s) => !s.is_won);
  stageFrom = nonWon[0];
  stageTo = nonWon[1] ?? stages[1];

  const { data: p, error: pe } = await admin
    .from("orbit_prospects")
    .insert({
      empresa_id: EMPRESA_ID,
      tipo: "pessoa",
      nome_razao: `Kanban Lead ${tag}`,
      telefone: "+5541997776655",
      status_qualificacao: "qualificado",
      origem_contato: "PROSPECTS",
    })
    .select("id")
    .single();
  if (pe) throw new Error(`seed prospect: ${pe.message}`);
  prospectId = p!.id;

  const { data: d, error: de } = await admin
    .from("orbit_deals")
    .insert({
      empresa_id: EMPRESA_ID,
      prospect_id: prospectId,
      etapa_id: stageFrom.id,
      titulo: `Kanban Deal ${tag}`,
      valor_estimado: 1000,
      origem: "manual",
    })
    .select("id")
    .single();
  if (de) throw new Error(`seed deal: ${de.message}`);
  dealId = d!.id;
});

test.afterAll(async () => {
  if (dealId) await admin.from("orbit_deals").delete().eq("id", dealId);
  if (prospectId) await admin.from("orbit_prospects").delete().eq("id", prospectId);
});

async function login(page: Page) {
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await page.evaluate(
    ([k, v]) => window.localStorage.setItem(k, v),
    [STORAGE_KEY, SESSION_JSON],
  );
  await page.goto(`${BASE}/${SLUG}/funil`, { waitUntil: "domcontentloaded" });
}

test("Arrastar Deal entre colunas atualiza orbit_deals.etapa_id", async ({ page }) => {
  await login(page);

  const card = page.locator(`[data-deal-id="${dealId}"]`).first();
  await card.waitFor({ timeout: 15_000 });

  const target = page.locator(`[data-column-id="${stageTo!.id}"]`).first();
  await target.waitFor({ timeout: 5_000 });

  // Dispara dragstart primeiro, aguarda o React aplicar setDraggedDeal,
  // depois dispara dragover/drop. Usa o MESMO DataTransfer compartilhado.
  await page.evaluate(
    (srcSel) => {
      const src = document.querySelector(srcSel) as HTMLElement | null;
      if (!src) throw new Error("Source não encontrado");
      (window as any).__e2eDt = new DataTransfer();
      src.dispatchEvent(
        new DragEvent("dragstart", {
          bubbles: true,
          cancelable: true,
          dataTransfer: (window as any).__e2eDt,
        }),
      );
    },
    `[data-deal-id="${dealId}"]`,
  );
  // Aguarda React aplicar o setState
  await page.waitForTimeout(150);

  await page.evaluate(
    ({ srcSel, tgtSel }) => {
      const src = document.querySelector(srcSel) as HTMLElement | null;
      const tgt = document.querySelector(tgtSel) as HTMLElement | null;
      if (!src || !tgt) throw new Error("Source ou target não encontrado");
      const dt = (window as any).__e2eDt as DataTransfer;
      tgt.dispatchEvent(
        new DragEvent("dragover", { bubbles: true, cancelable: true, dataTransfer: dt }),
      );
      tgt.dispatchEvent(
        new DragEvent("drop", { bubbles: true, cancelable: true, dataTransfer: dt }),
      );
      src.dispatchEvent(
        new DragEvent("dragend", { bubbles: true, cancelable: true, dataTransfer: dt }),
      );
    },
    {
      srcSel: `[data-deal-id="${dealId}"]`,
      tgtSel: `[data-column-id="${stageTo!.id}"]`,
    },
  );

  // Aguarda persistência (mutation + invalidate query)
  await expect
    .poll(
      async () => {
        const { data } = await admin
          .from("orbit_deals")
          .select("etapa_id")
          .eq("id", dealId)
          .single();
        return data?.etapa_id;
      },
      { timeout: 10_000, intervals: [500, 1000, 2000] },
    )
    .toBe(stageTo!.id);
});
