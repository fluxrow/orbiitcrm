/**
 * E2E — Golden Path: Chat
 *
 * Seed: prospect + conversa aberta + 1 mensagem IN (para garantir que o item aparece na lista).
 * Ações UI:
 *   1) Abre /conversas, clica na conversa seeded.
 *   2) Verifica que a mensagem seeded é renderizada.
 *   3) Digita uma mensagem nova e clica enviar.
 * Validação: nova mensagem OUT é persistida em orbit_mensagens (mesmo com Z-API offline,
 *            orbit-send-message grava com status="falhou"/"enviado").
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

const tag = `e2e-chat-${Date.now()}`;
const inboundText = `Ola mensagem inbound de teste E2E`;
const outboundText = `Resposta automatica do teste E2E`;
// nome SEM longas sequências de dígitos para a UI escolher nome_razao como label
const contatoLabel = `Chat E2E Teste Lead`;
let prospectId = "";
let conversaId = "";

test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  const { data: p, error: pe } = await admin
    .from("orbit_prospects")
    .insert({
      empresa_id: EMPRESA_ID,
      tipo: "pessoa",
      nome_razao: contatoLabel,
      nome_contato: contatoLabel,
      telefone: "+5541996665544",
      whatsapp: "+5541996665544",
      whatsapp_status: "valido",
      status_qualificacao: "em_qualificacao",
      origem_contato: "PROSPECTS",
    })
    .select("id")
    .single();
  if (pe) throw new Error(`seed prospect: ${pe.message}`);
  prospectId = p!.id;

  const { data: c, error: ce } = await admin
    .from("orbit_conversas")
    .insert({
      empresa_id: EMPRESA_ID,
      prospect_id: prospectId,
      canal: "whatsapp",
      status: "aberta",
      human_talk: true, // evita disparo do agente IA
      telefone_whatsapp: "+5541996665544",
    })
    .select("id")
    .single();
  if (ce) throw new Error(`seed conversa: ${ce.message}`);
  conversaId = c!.id;

  await admin.from("orbit_mensagens").insert({
    empresa_id: EMPRESA_ID,
    conversa_id: conversaId,
    direcao: "IN",
    mensagem: inboundText,
    canal: "whatsapp",
    status: "recebida",
  });
});

test.afterAll(async () => {
  if (conversaId) {
    await admin.from("orbit_mensagens").delete().eq("conversa_id", conversaId);
    await admin.from("orbit_conversas").delete().eq("id", conversaId);
  }
  if (prospectId) await admin.from("orbit_prospects").delete().eq("id", prospectId);
});

async function login(page: Page) {
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await page.evaluate(
    ([k, v]) => window.localStorage.setItem(k, v),
    [STORAGE_KEY, SESSION_JSON],
  );
  await page.goto(`${BASE}/${SLUG}/conversas`, { waitUntil: "domcontentloaded" });
}

test("Abrir conversa existente renderiza mensagem inbound", async ({ page }) => {
  await login(page);
  const item = page.getByText(contatoLabel).first();
  await item.click({ timeout: 15_000 });
  await expect(page.getByText(inboundText)).toBeVisible({ timeout: 10_000 });
});

test("Envio de mensagem persiste registro OUT em orbit_mensagens", async ({ page }) => {
  await login(page);
  const item = page.getByText(contatoLabel).first();
  await item.click({ timeout: 15_000 });

  const input = page.getByPlaceholder("Mensagem...");
  await input.waitFor({ timeout: 10_000 });
  await input.fill(outboundText);
  await input.press("Enter");

  await expect
    .poll(
      async () => {
        const { data } = await admin
          .from("orbit_mensagens")
          .select("id, mensagem, direcao")
          .eq("conversa_id", conversaId)
          .eq("direcao", "OUT")
          .eq("mensagem", outboundText);
        return data?.length ?? 0;
      },
      { timeout: 15_000, intervals: [500, 1000, 2000] },
    )
    .toBeGreaterThan(0);
});
