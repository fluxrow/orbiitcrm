/**
 * E2E — Golden Path: [CORE] Orbit Core Flow — round-trip export/import na UI
 *
 * Objetivo: provar que exportar o template oficial via UI e reimportá-lo
 * mantém a definição byte-a-byte idêntica — incluindo placeholders
 * reconhecidos e prompts da IA — e que a duplicata atualiza in-place em vez
 * de criar cópia.
 *
 * Falha imediata (retries: 0) — divergência = regressão do Core Flow.
 */
import { test, expect, type Page, type Download } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import {
  parseTemplateImport,
  inspectFlowDefinition,
  type FlowTemplateExport,
} from "../../src/lib/flowTemplateSchema";

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
const CORE_NAME = "[CORE] Orbit Core Flow";

const STORAGE_KEY = process.env.LOVABLE_BROWSER_SUPABASE_STORAGE_KEY!;
const SESSION_JSON = process.env.LOVABLE_BROWSER_SUPABASE_SESSION_JSON!;
const ACCESS_TOKEN = process.env.LOVABLE_BROWSER_SUPABASE_ACCESS_TOKEN!;
const SUPABASE_URL = process.env.VITE_SUPABASE_URL!;
const SUPABASE_ANON = process.env.VITE_SUPABASE_PUBLISHABLE_KEY!;

const admin = createClient(SUPABASE_URL, SUPABASE_ANON, {
  global: { headers: { Authorization: `Bearer ${ACCESS_TOKEN}` } },
  auth: { persistSession: false, autoRefreshToken: false },
});

test.describe.configure({ mode: "serial", retries: 0 });

let originalExport: FlowTemplateExport | null = null;
let originalFilePath = "";

async function login(page: Page) {
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await page.evaluate(
    ([k, v]) => window.localStorage.setItem(k, v),
    [STORAGE_KEY, SESSION_JSON],
  );
  await page.goto(`${BASE}/${SLUG}/config?tab=flow-templates`, {
    waitUntil: "domcontentloaded",
  });
  // aguarda o card do Core Flow aparecer
  await expect(page.getByText(CORE_NAME).first()).toBeVisible({ timeout: 20_000 });
}

/** Extrai placeholders + slugs de agente + prompt slugs em ordem estável. */
function extractAiPromptSignature(def: any): string[] {
  const out: string[] = [];
  const walk = (actions: any[]) => {
    if (!Array.isArray(actions)) return;
    for (const a of actions) {
      if (!a || typeof a !== "object") continue;
      if (a.action_type === "toggle_ai_agent") {
        const cfg = a.action_config ?? {};
        out.push(
          `slug=${cfg.prompt_slug ?? cfg.agent_slug ?? cfg.slug ?? ""}`,
          `system=${cfg.system_prompt ?? ""}`,
          `user=${cfg.user_prompt ?? ""}`,
          `human=${cfg.human_talk ?? ""}`,
        );
      }
      const cfg = a.action_config ?? {};
      if (Array.isArray(cfg?.then)) walk(cfg.then);
      if (Array.isArray(cfg?.else)) walk(cfg.else);
      if (Array.isArray(cfg?.then_actions)) walk(cfg.then_actions);
      if (Array.isArray(cfg?.else_actions)) walk(cfg.else_actions);
      if (Array.isArray(cfg?.cases)) for (const c of cfg.cases) walk(c?.actions ?? []);
      if (Array.isArray(cfg?.default)) walk(cfg.default);
      if (Array.isArray(cfg?.default_actions)) walk(cfg.default_actions);
    }
  };
  walk(def?.actions ?? []);
  return out;
}

test("1) Exporta o [CORE] Orbit Core Flow via UI e valida assinatura do arquivo", async ({
  page,
}) => {
  await login(page);

  // Card do Core Flow → botão "Exportar .flow.json"
  const card = page
    .locator("div", { hasText: CORE_NAME })
    .filter({ has: page.getByRole("button", { name: /Exportar/i }) })
    .first();
  await expect(card).toBeVisible();

  const [download]: [Download] = await Promise.all([
    page.waitForEvent("download"),
    card.getByRole("button", { name: /Exportar/i }).click(),
  ]);

  originalFilePath = path.join(os.tmpdir(), `core-flow-e2e-${Date.now()}.flow.json`);
  await download.saveAs(originalFilePath);
  const txt = fs.readFileSync(originalFilePath, "utf8");
  const parsed = parseTemplateImport(txt);
  expect(parsed.ok).toBe(true);
  if (parsed.ok !== true) throw new Error("parse falhou");

  originalExport = parsed.data;

  expect(originalExport.version).toBe(1);
  expect(originalExport.nome).toBe(CORE_NAME);
  expect(originalExport.categoria).toBe("Core");
  expect(Array.isArray(originalExport.definicao.actions)).toBe(true);
  expect(originalExport.definicao.actions!.length).toBe(7);
});

test("2) Importar a duplicata atualiza in-place — não cria cópia", async ({ page }) => {
  if (!originalExport) test.skip(true, "export do teste 1 ausente");
  await login(page);

  // dbBefore: count e id do Core Flow no banco
  const { data: before } = await admin
    .from("orbit_flow_templates" as any)
    .select("id, nome, is_official")
    .eq("nome", CORE_NAME);
  expect(before?.length).toBe(1);
  const originalId = (before as any)[0].id;

  // aceita o window.confirm("...atualizar existente?") clicando em OK
  page.once("dialog", async (d) => {
    expect(d.message()).toMatch(/já existe/i);
    await d.accept();
  });

  // Sobe o arquivo no input file oculto
  const fileInput = page.locator('input[type="file"][accept*="json"]').first();
  await fileInput.setInputFiles(originalFilePath);

  // ImportPreviewDialog abre; validações devem passar (0 unknown placeholders).
  const dialog = page.getByRole("dialog", { name: new RegExp(`Prévia do import`) });
  await expect(dialog).toBeVisible({ timeout: 10_000 });
  // botão "Importar" (não "Mapeamento pendente")
  const importBtn = dialog.getByRole("button", { name: /^Importar$/ });
  await expect(importBtn).toBeEnabled();
  await importBtn.click();

  // toast "Template atualizado"
  await expect(page.getByText(/Template atualizado/i)).toBeVisible({ timeout: 10_000 });

  // dbAfter: mesmo id, um só registro, ainda oficial
  await expect
    .poll(
      async () => {
        const { data } = await admin
          .from("orbit_flow_templates" as any)
          .select("id, is_official")
          .eq("nome", CORE_NAME);
        return {
          count: data?.length ?? 0,
          sameId: (data as any)?.[0]?.id === originalId,
          official: (data as any)?.[0]?.is_official === true,
        };
      },
      { timeout: 10_000, intervals: [500, 1000, 2000] },
    )
    .toEqual({ count: 1, sameId: true, official: true });

  // UI: nenhum card com sufixo "(import)" ou "(cópia)"
  await expect(page.getByText(new RegExp(`${CORE_NAME.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} \\((import|cópia)`))).toHaveCount(0);
});

test("3) Round-trip preserva placeholders e prompts da IA byte-a-byte", async ({
  page,
}) => {
  if (!originalExport) test.skip(true, "export do teste 1 ausente");
  await login(page);

  const card = page
    .locator("div", { hasText: CORE_NAME })
    .filter({ has: page.getByRole("button", { name: /Exportar/i }) })
    .first();

  const [download]: [Download] = await Promise.all([
    page.waitForEvent("download"),
    card.getByRole("button", { name: /Exportar/i }).click(),
  ]);
  const reFile = path.join(os.tmpdir(), `core-flow-e2e-re-${Date.now()}.flow.json`);
  await download.saveAs(reFile);
  const reParsed = parseTemplateImport(fs.readFileSync(reFile, "utf8"));
  expect(reParsed.ok).toBe(true);
  if (reParsed.ok !== true) throw new Error("re-parse falhou");
  const reexported = reParsed.data;

  // 1. definicao inteira idêntica
  expect(reexported.definicao).toEqual(originalExport!.definicao);
  expect(reexported.nome).toBe(originalExport!.nome);
  expect(reexported.descricao).toBe(originalExport!.descricao);
  expect(reexported.categoria).toBe(originalExport!.categoria);

  // 2. placeholders reconhecidos preservados; nenhum desconhecido
  const before = inspectFlowDefinition(originalExport!.definicao);
  const after = inspectFlowDefinition(reexported.definicao);
  expect(after.placeholders.sort()).toEqual(before.placeholders.sort());
  expect(after.unknownPlaceholders).toEqual([]);
  expect(before.unknownPlaceholders).toEqual([]);
  expect(after.usedTemplateIds.sort()).toEqual(before.usedTemplateIds.sort());
  expect(after.usedAgentSlugs.sort()).toEqual(before.usedAgentSlugs.sort());

  // 3. prompts / slugs da IA idênticos (cobre CORE_QUALIFICACAO_INICIAL e CORE_FOLLOWUP)
  const aiBefore = extractAiPromptSignature(originalExport!.definicao);
  const aiAfter = extractAiPromptSignature(reexported.definicao);
  expect(aiAfter).toEqual(aiBefore);
  expect(aiBefore.some((s) => s.includes("CORE_QUALIFICACAO_INICIAL"))).toBe(true);
  expect(aiBefore.some((s) => s.includes("CORE_FOLLOWUP"))).toBe(true);
});
