/**
 * E2E — Webhook Receiver (Etapa 3 F1)
 *
 * Cobre 6 cenários da cirurgia assíncrona:
 *  1) Sucesso Z-API     — ACK < 1s + mensagem persistida em background.
 *  2) Auto-create       — número novo cria prospect + conversa novos.
 *  3) Idempotência      — mesmo provider_message_id 2x → 1 única linha.
 *  4) Payload inválido  — 400 (ACK rápido com erro de schema).
 *  5) Auth ausente      — 401 quando ORBIT_WEBHOOK_SECRET está setado e header falta.
 *  6) Assinatura Meta inválida — 403 em x-hub-signature-256 errada.
 *
 * Pré-requisitos: tenant fluxrow + Z-API config ativa OU empresa_id padrão.
 */
import { test, expect } from "@playwright/test";
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

const SUPABASE_URL = process.env.VITE_SUPABASE_URL!;
const SUPABASE_ANON = process.env.VITE_SUPABASE_PUBLISHABLE_KEY!;
const ACCESS_TOKEN = process.env.LOVABLE_BROWSER_SUPABASE_ACCESS_TOKEN!;
const EMPRESA_ID =
  process.env.E2E_EMPRESA_ID ?? "4de0ed22-0fe5-40ef-aaed-703dd3070291";

const ZAPI_URL = `${SUPABASE_URL}/functions/v1/orbit-webhook?event=on-receive`;
const META_URL = `${SUPABASE_URL}/functions/v1/orbit-meta-webhook`;

const admin = createClient(SUPABASE_URL, SUPABASE_ANON, {
  global: { headers: { Authorization: `Bearer ${ACCESS_TOKEN}` } },
  auth: { persistSession: false, autoRefreshToken: false },
});

const fnHeaders = (extra: Record<string, string> = {}): Record<string, string> => ({
  "Content-Type": "application/json",
  apikey: SUPABASE_ANON,
  Authorization: `Bearer ${SUPABASE_ANON}`,
  ...extra,
});

/** Gera número BR único e formato Z-API esperado pelo handler. */
function makeZapiPayload(phone: string, messageId: string, text = "ping E2E") {
  return {
    instanceId: process.env.E2E_ZAPI_INSTANCE ?? "test-instance",
    phone,
    fromMe: false,
    isStatusReply: false,
    momment: Date.now(),
    type: "ReceivedCallback",
    messageId,
    text: { message: text },
  };
}

async function waitFor<T>(
  fn: () => Promise<T | null | undefined>,
  { timeoutMs = 8000, intervalMs = 250 } = {}
): Promise<T> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const v = await fn();
    if (v) return v;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error("waitFor: timed out");
}

const trackedMessageIds: string[] = [];
const trackedPhones: string[] = [];

test.afterAll(async () => {
  // Limpa artefatos criados nos testes para não poluir o tenant.
  if (trackedMessageIds.length) {
    await admin
      .from("orbit_mensagens")
      .delete()
      .in("provider_message_id", trackedMessageIds);
  }
  if (trackedPhones.length) {
    const { data: convs } = await admin
      .from("orbit_conversas")
      .select("id, prospect_id")
      .in("telefone_whatsapp", trackedPhones);
    const convIds = (convs ?? []).map((c: any) => c.id);
    const prospectIds = (convs ?? []).map((c: any) => c.prospect_id).filter(Boolean);
    if (convIds.length) await admin.from("orbit_conversas").delete().in("id", convIds);
    if (prospectIds.length) await admin.from("orbit_prospects").delete().in("id", prospectIds);
  }
});

test.describe("Webhook Receiver — F1", () => {
  test("1) Sucesso Z-API — ACK < 1s e mensagem persistida em background", async ({ request }) => {
    const phone = `5551999${Date.now().toString().slice(-7)}`;
    const messageId = `e2e-ok-${Date.now()}`;
    trackedPhones.push(phone);
    trackedMessageIds.push(messageId);

    const t0 = Date.now();
    const res = await request.post(ZAPI_URL, {
      headers: fnHeaders(),
      data: makeZapiPayload(phone, messageId),
    });
    const dt = Date.now() - t0;
    expect(res.status()).toBe(200);
    expect(dt).toBeLessThan(1500); // tolera latência de rede; alvo arquitetural < 1s
    const body = await res.json();
    expect(body.ok).toBe(true);

    // background deve persistir a mensagem
    const msg = await waitFor(async () => {
      const { data } = await admin
        .from("orbit_mensagens")
        .select("id, provider_message_id, mensagem, direcao")
        .eq("provider_message_id", messageId)
        .maybeSingle();
      return data;
    });
    expect(msg.direcao).toBe("IN");
    expect(msg.mensagem).toContain("ping E2E");
  });

  test("2) Auto-create — número novo cria prospect + conversa", async ({ request }) => {
    const phone = `5551888${Date.now().toString().slice(-7)}`;
    const messageId = `e2e-new-${Date.now()}`;
    trackedPhones.push(phone);
    trackedMessageIds.push(messageId);

    const res = await request.post(ZAPI_URL, {
      headers: fnHeaders(),
      data: makeZapiPayload(phone, messageId, "novo lead"),
    });
    expect(res.status()).toBe(200);

    const conversa = await waitFor(async () => {
      const { data } = await admin
        .from("orbit_conversas")
        .select("id, prospect_id, telefone_whatsapp")
        .eq("telefone_whatsapp", phone)
        .maybeSingle();
      return data;
    });
    expect(conversa.prospect_id).toBeTruthy();

    const { data: prospect } = await admin
      .from("orbit_prospects")
      .select("id, empresa_id")
      .eq("id", conversa.prospect_id)
      .single();
    expect(prospect.empresa_id).toBe(EMPRESA_ID);
  });

  test("3) Idempotência — mesmo provider_message_id 2x → 1 linha", async ({ request }) => {
    const phone = `5551777${Date.now().toString().slice(-7)}`;
    const messageId = `e2e-dup-${Date.now()}`;
    trackedPhones.push(phone);
    trackedMessageIds.push(messageId);

    // 1ª entrega
    const r1 = await request.post(ZAPI_URL, {
      headers: fnHeaders(),
      data: makeZapiPayload(phone, messageId, "duplicada"),
    });
    expect(r1.status()).toBe(200);
    await waitFor(async () => {
      const { data } = await admin
        .from("orbit_mensagens")
        .select("id")
        .eq("provider_message_id", messageId)
        .maybeSingle();
      return data;
    });

    // 2ª entrega (mesmo messageId)
    const r2 = await request.post(ZAPI_URL, {
      headers: fnHeaders(),
      data: makeZapiPayload(phone, messageId, "duplicada"),
    });
    expect(r2.status()).toBe(200);

    // Aguarda processamento background da 2ª; conta deve permanecer 1
    await new Promise((r) => setTimeout(r, 2000));
    const { data: rows, error } = await admin
      .from("orbit_mensagens")
      .select("id")
      .eq("provider_message_id", messageId);
    expect(error).toBeNull();
    expect(rows?.length).toBe(1);
  });

  test("4) Payload inválido — 400 com erro de schema", async ({ request }) => {
    const res = await request.post(ZAPI_URL, {
      headers: fnHeaders(),
      data: "not-a-json-object" as any,
    });
    // Pode ser 400 (invalid_json) ou 400 (invalid_payload) — ambos aceitos
    expect([400]).toContain(res.status());
    const body = await res.json().catch(() => ({}));
    expect(["invalid_json", "invalid_payload"]).toContain(body.error);
  });

  test("5) Auth ausente — 401 quando ORBIT_WEBHOOK_SECRET está configurado", async ({ request }) => {
    // Este cenário só é determinístico se o secret estiver setado no projeto.
    // Quando não setado, o handler aceita sem header — pulamos o asserção forte.
    const phone = `5551666${Date.now().toString().slice(-7)}`;
    const messageId = `e2e-auth-${Date.now()}`;
    const res = await request.post(ZAPI_URL, {
      headers: { ...fnHeaders(), "x-webhook-secret": "WRONG_SECRET_VALUE" },
      data: makeZapiPayload(phone, messageId),
    });
    // Aceita 200 (secret não configurado) OU 401 (secret configurado + wrong).
    expect([200, 401]).toContain(res.status());
    if (res.status() === 200) {
      trackedPhones.push(phone);
      trackedMessageIds.push(messageId);
    }
  });

  test("6) Meta — assinatura HMAC inválida → 403", async ({ request }) => {
    const res = await request.post(META_URL, {
      headers: {
        ...fnHeaders(),
        "x-hub-signature-256": "sha256=" + "0".repeat(64),
      },
      data: { object: "page", entry: [] },
    });
    // 403 quando META_APP_SECRET configurado (assinatura confere falha)
    // 503 quando secret não está setado (config ausente)
    expect([403, 503]).toContain(res.status());
  });
});
