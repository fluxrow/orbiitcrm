import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  classifyAsyncSendError,
  extractProviderMessageIds,
  MAX_PROVIDER_IDS,
  reconcileAsyncSendError,
  shouldReconcileAsyncError,
} from "./zapi-async-send-error.ts";

const EMPRESA = "36f26579-66ad-4ef1-9788-141e4c727232";
const OTHER = "4f6b4a18-f3aa-4bfb-a13f-926e4a07ad18";

// ── Extração de IDs ───────────────────────────────────────────────────────────

Deno.test("extrai messageId, zaapId e ids[]", () => {
  const ids = extractProviderMessageIds({
    messageId: "MSG1",
    zaapId: "ZAAP1",
    ids: ["A1", "A2"],
  });
  assertEquals(ids, ["MSG1", "ZAAP1", "A1", "A2"]);
});

Deno.test("deduplica, ignora vazios e limita quantidade", () => {
  assertEquals(
    extractProviderMessageIds({ messageId: "X", zaapId: " X ", ids: ["X", "", null, 7] }),
    ["X", "7"],
  );
  const many = Array.from({ length: 60 }, (_, i) => `id-${i}`);
  assertEquals(extractProviderMessageIds({ ids: many }).length, MAX_PROVIDER_IDS);
  assertEquals(extractProviderMessageIds({}), []);
});

// ── Classificação ─────────────────────────────────────────────────────────────

Deno.test("classifica erro assíncrono conhecido e sanitiza", () => {
  const c = classifyAsyncSendError({ error: "Phone number does not exist" });
  assertEquals(c?.code, "phone_number_does_not_exist");
  assertEquals(c?.sanitized, "provider_async_error: phone_number_does_not_exist");
  assertEquals(c?.invalidPhone, true);
});

Deno.test("callback sem erro conhecido não é reconciliado", () => {
  assertEquals(classifyAsyncSendError({ status: "DELIVERED" }), null);
  assertEquals(classifyAsyncSendError({}), null);
  const r = shouldReconcileAsyncError({
    eventType: "on-send",
    payload: { messageId: "M1", status: "SENT" },
  });
  assertEquals(r.reconcile, false);
});

Deno.test("on-send com erro conhecido aciona reconciliação", () => {
  const r = shouldReconcileAsyncError({
    eventType: "on-send",
    payload: { type: "MessageStatusCallback", messageId: "M1", error: "Phone number does not exist" },
  });
  assertEquals(r.reconcile, true);
  assertEquals(r.ids, ["M1"]);
});

Deno.test("erro sem nenhum id não reconcilia", () => {
  const r = shouldReconcileAsyncError({
    eventType: "on-send",
    payload: { error: "Phone number does not exist" },
  });
  assertEquals(r.reconcile, false);
});

// ── Stub de banco (registra todas as operações; nunca envia nada) ─────────────

type Row = Record<string, any>;

function makeSupabase(seed: { outbox: Row[]; mensagens: Row[]; recipients: Row[]; prospects: Row[] }) {
  const calls: string[] = [];
  const rpcs: string[] = [];

  function table(name: string, rows: Row[]) {
    const filters: Array<(r: Row) => boolean> = [];
    let patch: Row | null = null;
    const api: any = {
      update(p: Row) { patch = p; return api; },
      eq(col: string, val: any) { filters.push((r) => r[col] === val); return api; },
      neq(col: string, val: any) { filters.push((r) => r[col] !== val); return api; },
      in(col: string, vals: any[]) { filters.push((r) => vals.includes(r[col])); return api; },
      select() {
        const matched = rows.filter((r) => filters.every((f) => f(r)));
        if (patch) {
          calls.push(`${name}:update:${matched.length}`);
          for (const r of matched) Object.assign(r, patch);
        }
        return Promise.resolve({ data: matched.map((r) => ({ ...r })), error: null });
      },
    };
    return api;
  }

  return {
    calls,
    rpcs,
    seed,
    from(name: string) {
      const map: Record<string, Row[]> = {
        orbit_whatsapp_outbox: seed.outbox,
        orbit_mensagens: seed.mensagens,
        orbit_campaign_recipients: seed.recipients,
        orbit_prospects: seed.prospects,
      };
      return table(name, map[name] ?? []);
    },
    rpc(fn: string, args: Row) {
      rpcs.push(`${fn}:${args._campaign_id}`);
      return Promise.resolve({ data: null, error: null });
    },
  };
}

function seedCampaign() {
  return {
    outbox: [{
      id: "o1", empresa_id: EMPRESA, status: "sent", provider_message_id: "M1",
      source_type: "campaign", campaign_id: "camp1", prospect_id: "p1",
      conversa_id: "c1", sent_at: "2026-09-10T10:00:00Z",
    }],
    mensagens: [{
      id: "m1", empresa_id: EMPRESA, provider_message_id: "M1", direcao: "OUT", status: "enviada",
    }],
    recipients: [{ id: "r1", campaign_id: "camp1", prospect_id: "p1", status: "enviado" }],
    prospects: [{ id: "p1", empresa_id: EMPRESA, whatsapp_status: "valido" }],
  };
}

const CLASSIFICATION = classifyAsyncSendError({ error: "Phone number does not exist" })!;

Deno.test("reconciliação marca outbox, mensagem, recipient e prospect", async () => {
  const seed = seedCampaign();
  const sb = makeSupabase(seed);
  const res = await reconcileAsyncSendError(sb as any, {
    empresa_id: EMPRESA,
    provider_message_ids: ["M1"],
    classification: CLASSIFICATION,
  });

  assertEquals(res.outbox_failed, 1);
  assertEquals(res.mensagens_failed, 1);
  assertEquals(res.recipients_failed, 1);
  assertEquals(res.prospects_invalidated, 1);
  assertEquals(res.campaigns_reconciled, 1);
  assertEquals(sb.rpcs, ["reconcile_campaign_counters:camp1"]);

  // Outbox: failed, evidência preservada, locks limpos, sem reenvio.
  const ob = seed.outbox[0];
  assertEquals(ob.status, "failed");
  assertEquals(ob.last_error, "provider_async_error: phone_number_does_not_exist");
  assertEquals(ob.sent_at, null);
  assertEquals(ob.locked_at, null);
  assertEquals(ob.locked_by, null);
  assertEquals(ob.next_attempt_at, null);
  assertEquals(ob.provider_message_id, "M1");

  assertEquals(seed.mensagens[0].status, "falhou");
  assertEquals(seed.recipients[0].status, "falhou");
  assertEquals(seed.prospects[0].whatsapp_status, "invalido");
  assertEquals(typeof seed.prospects[0].whatsapp_last_check_at, "string");

  // Nenhuma criação de outbox ou envio: apenas updates.
  assertEquals(sb.calls.every((c) => c.includes(":update:")), true);
});

Deno.test("callback duplicado é idempotente (segunda vez não muda nada)", async () => {
  const seed = seedCampaign();
  const sb = makeSupabase(seed);
  await reconcileAsyncSendError(sb as any, {
    empresa_id: EMPRESA, provider_message_ids: ["M1"], classification: CLASSIFICATION,
  });
  const second = await reconcileAsyncSendError(sb as any, {
    empresa_id: EMPRESA, provider_message_ids: ["M1"], classification: CLASSIFICATION,
  });
  assertEquals(second.outbox_failed, 0);
  assertEquals(second.already_reconciled, true);
  assertEquals(second.recipients_failed, 0);
  assertEquals(second.prospects_invalidated, 0);
  assertEquals(sb.rpcs.length, 1);
});

Deno.test("outbox que não está sent não é transicionada", async () => {
  const seed = seedCampaign();
  seed.outbox[0].status = "canceled";
  const sb = makeSupabase(seed);
  const res = await reconcileAsyncSendError(sb as any, {
    empresa_id: EMPRESA, provider_message_ids: ["M1"], classification: CLASSIFICATION,
  });
  assertEquals(res.outbox_failed, 0);
  assertEquals(seed.outbox[0].status, "canceled");
});

Deno.test("isolamento de tenant: outro empresa_id não afeta nada", async () => {
  const seed = seedCampaign();
  const sb = makeSupabase(seed);
  const res = await reconcileAsyncSendError(sb as any, {
    empresa_id: OTHER, provider_message_ids: ["M1"], classification: CLASSIFICATION,
  });
  assertEquals(res.outbox_failed, 0);
  assertEquals(res.already_reconciled, true);
  assertEquals(seed.outbox[0].status, "sent");
  assertEquals(seed.mensagens[0].status, "enviada");
  assertEquals(seed.recipients[0].status, "enviado");
  assertEquals(seed.prospects[0].whatsapp_status, "valido");
});

Deno.test("origem não-campaign não toca recipients nem contadores", async () => {
  const seed = seedCampaign();
  seed.outbox[0].source_type = "ai_reply";
  seed.outbox[0].campaign_id = null;
  const sb = makeSupabase(seed);
  const res = await reconcileAsyncSendError(sb as any, {
    empresa_id: EMPRESA, provider_message_ids: ["M1"], classification: CLASSIFICATION,
  });
  assertEquals(res.outbox_failed, 1);
  assertEquals(res.recipients_failed, 0);
  assertEquals(res.campaigns_reconciled, 0);
  assertEquals(seed.recipients[0].status, "enviado");
  assertEquals(seed.prospects[0].whatsapp_status, "invalido");
});

Deno.test("sem empresa_id ou sem ids não executa nenhuma operação", async () => {
  const seed = seedCampaign();
  const sb = makeSupabase(seed);
  assertEquals((await reconcileAsyncSendError(sb as any, {
    empresa_id: "", provider_message_ids: ["M1"], classification: CLASSIFICATION,
  })).outbox_failed, 0);
  assertEquals((await reconcileAsyncSendError(sb as any, {
    empresa_id: EMPRESA, provider_message_ids: [], classification: CLASSIFICATION,
  })).outbox_failed, 0);
  assertEquals(sb.calls.length, 0);
  assertEquals(seed.outbox[0].status, "sent");
});
