// Testes dry_run do destinatário de notificações internas por WhatsApp.
// Nenhuma chamada externa: supabase é um stub em memória.

import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import {
  resolveInternalNotificationTarget,
  normalizeE164Digits,
  isValidNotificationPhone,
} from "./internal-notification.ts";

const BULLINK = "4f6b4a18-f3aa-4bfb-a13f-926e4a07ad18";
const OUTRO_TENANT = "36f26579-66ad-4ef1-9788-141e4c727232";
const CANARIO = "5541992361868";

interface Fixture {
  ai_config: Record<string, any>;
  zapi: Record<string, any>;
  profiles: Record<string, any>;
  pe_users: Record<string, any>;
}

function makeSupabase(fx: Fixture, touched: string[] = []) {
  return {
    from(table: string) {
      touched.push(table);
      const builder: any = {
        _table: table,
        _filters: {} as Record<string, any>,
        select() { return builder; },
        eq(col: string, val: any) { builder._filters[col] = val; return builder; },
        maybeSingle() { return Promise.resolve({ data: resolveRow(fx, table, builder._filters) }); },
        single() { return Promise.resolve({ data: resolveRow(fx, table, builder._filters) }); },
      };
      return builder;
    },
    _touched: touched,
  };
}

function resolveRow(fx: Fixture, table: string, f: Record<string, any>): any {
  if (table === "orbit_ai_config") return fx.ai_config[f.empresa_id] ?? null;
  if (table === "orbit_zapi_config") return fx.zapi[f.empresa_id] ?? null;
  if (table === "profiles") return fx.profiles[f.id] ?? null;
  if (table === "pe_users") return fx.pe_users[f.id] ?? null;
  return null;
}

const baseFixture = (): Fixture => ({
  ai_config: {
    [BULLINK]: { notification_recipient_whatsapp: null, scheduling_handoff_whatsapp: "5547991237508" },
    [OUTRO_TENANT]: { notification_recipient_whatsapp: null, scheduling_handoff_whatsapp: "5547984312323" },
  },
  zapi: { [BULLINK]: { canary_phone_numbers: [CANARIO] } },
  profiles: {
    // Cauã (Dono) — causa do bug anterior: era escolhido como destinatário.
    "caua": { id: "caua", telefone: "41992361868", empresa_id: BULLINK },
    "fernando": { id: "fernando", telefone: null, empresa_id: BULLINK },
    "outro": { id: "outro", telefone: "5511999999999", empresa_id: OUTRO_TENANT },
  },
  pe_users: {
    "caua": { whatsapp: CANARIO, phone: "41992361868" },
    "fernando": { whatsapp: null, phone: null },
    "outro": { whatsapp: "5511999999999", phone: null },
  },
});

Deno.test("normalização E.164 e validação de dígitos", () => {
  assertEquals(normalizeE164Digits("(47) 99123-7508"), "5547991237508");
  assertEquals(normalizeE164Digits("+55 47 99123 7508"), "5547991237508");
  assertEquals(normalizeE164Digits("41992361868"), CANARIO);
  assertEquals(normalizeE164Digits(""), "");
  assertEquals(isValidNotificationPhone("99123-7508"), false);
  assertEquals(isValidNotificationPhone("5547991237508"), true);
});

Deno.test("lead qualificado no Bullink resolve Fernando (5547991237508)", async () => {
  const fx = baseFixture();
  const sb = makeSupabase(fx);
  const t = await resolveInternalNotificationTarget(sb, BULLINK, { vendedorId: "caua" });
  assertEquals(t.phone, "5547991237508");
  assertEquals(t.source, "ai_config_scheduling_handoff");
});

Deno.test("intenção verificada no Bullink resolve Fernando mesmo sem vendedor", async () => {
  const fx = baseFixture();
  const t = await resolveInternalNotificationTarget(makeSupabase(fx), BULLINK, {});
  assertEquals(t.phone, "5547991237508");
});

Deno.test("campo explícito notification_recipient_whatsapp tem prioridade", async () => {
  const fx = baseFixture();
  fx.ai_config[BULLINK].notification_recipient_whatsapp = "+55 (47) 99123-7508";
  const t = await resolveInternalNotificationTarget(makeSupabase(fx), BULLINK, { vendedorId: "caua" });
  assertEquals(t.phone, "5547991237508");
  assertEquals(t.source, "ai_config_notification_recipient");
});

Deno.test("canary_phone_numbers NUNCA é destinatário de notificação", async () => {
  const fx = baseFixture();
  const touched: string[] = [];
  const t = await resolveInternalNotificationTarget(makeSupabase(fx, touched), BULLINK, { vendedorId: "caua" });
  assertEquals(t.phone === CANARIO, false);
  assertEquals(touched.includes("orbit_zapi_config"), false);
});

Deno.test("sem config do tenant não há fallback para o canário do Dono", async () => {
  const fx = baseFixture();
  fx.ai_config[BULLINK] = { notification_recipient_whatsapp: null, scheduling_handoff_whatsapp: null };
  // Sem vendedor informado: nenhum destinatário (não cai no telefone do Cauã).
  const t = await resolveInternalNotificationTarget(makeSupabase(fx), BULLINK, {});
  assertEquals(t.phone, null);
  assertEquals(t.source, "none");
});

Deno.test("isolamento multi-tenant: vendedor de outro tenant é rejeitado", async () => {
  const fx = baseFixture();
  fx.ai_config[BULLINK] = { notification_recipient_whatsapp: null, scheduling_handoff_whatsapp: null };
  const t = await resolveInternalNotificationTarget(makeSupabase(fx), BULLINK, { vendedorId: "outro" });
  assertEquals(t.phone, null);
  assertEquals(t.reason, "vendedor pertence a outro tenant");
});

Deno.test("outros tenants mantêm seus destinatários", async () => {
  const fx = baseFixture();
  const t = await resolveInternalNotificationTarget(makeSupabase(fx), OUTRO_TENANT, { vendedorId: "outro" });
  assertEquals(t.phone, "5547984312323");
});

Deno.test("empresa_id ausente nunca resolve telefone", async () => {
  const t = await resolveInternalNotificationTarget(makeSupabase(baseFixture()), null, { vendedorId: "caua" });
  assertEquals(t.phone, null);
});
