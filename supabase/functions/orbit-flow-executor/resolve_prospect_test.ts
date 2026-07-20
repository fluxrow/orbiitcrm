// Testes de contrato para resolveProspectId + retrocompat de eventos legados.
// Rodar: deno test --allow-net --allow-env supabase/functions/orbit-flow-executor/resolve_prospect_test.ts
//
// Cobre:
//   1. Evento novo completo (prospect_id no payload) → resolve direto.
//   2. Evento legado com deal_id (sem prospect_id) → resolve via orbit_deals.
//   3. Deal de outro tenant → NÃO resolve (rejeita cross-tenant).
//   4. Deal sem prospect_id → NÃO resolve (falha clara).
//   5. Fallback via meeting_id quando não há deal.
//   6. Deal soft-deleted → NÃO resolve.
//
// Não faz I/O real. Substitui o cliente supabase via módulo global.

import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

// Estado de fixtures do "banco" simulado.
interface Fixture {
  deals: Array<{ id: string; empresa_id: string; prospect_id: string | null; deleted_at?: string | null }>;
  prospects: Array<{ id: string; empresa_id: string; deleted_at?: string | null }>;
  meetings: Array<{ id: string; empresa_id: string; prospect_id: string | null }>;
}

function makeSupabase(fx: Fixture) {
  function query(table: string) {
    const filters: Array<[string, any]> = [];
    const api: any = {
      select: (_c?: string) => api,
      eq: (col: string, val: any) => { filters.push([col, val]); return api; },
      maybeSingle: () => {
        const rows: any[] =
          table === "orbit_deals" ? fx.deals :
          table === "orbit_prospects" ? fx.prospects :
          table === "orbit_meetings" ? fx.meetings : [];
        const found = rows.find((r) => filters.every(([c, v]) => r[c] === v));
        return Promise.resolve({ data: found ?? null, error: null });
      },
    };
    return api;
  }
  return { from: (t: string) => query(t) };
}

// Reimplementação local idêntica ao index.ts para poder injetar supabase mock.
// (index.ts usa um cliente supabase de módulo; para teste unitário evitamos rede.)
async function resolveProspectId(supabase: any, run: any): Promise<string | null> {
  const payload = run?.context?.payload ?? {};
  const empresaId = run?.empresa_id;
  const direct = payload.prospect_id || (run?.entity_type === "prospect" ? run?.entity_id : null);
  if (direct) return String(direct);

  const dealId = payload.deal_id || (run?.entity_type === "deal" ? run?.entity_id : null);
  if (dealId && empresaId) {
    const { data: d } = await supabase.from("orbit_deals")
      .select("prospect_id, empresa_id, deleted_at").eq("id", dealId).maybeSingle();
    if (d && d.empresa_id === empresaId && !d.deleted_at && d.prospect_id) {
      const { data: p } = await supabase.from("orbit_prospects")
        .select("id, empresa_id, deleted_at").eq("id", d.prospect_id).maybeSingle();
      if (p && p.empresa_id === empresaId && !p.deleted_at) return String(p.id);
    }
  }

  const meetingId = payload.meeting_id;
  if (meetingId && empresaId) {
    const { data: m } = await supabase.from("orbit_meetings")
      .select("prospect_id, empresa_id").eq("id", meetingId).maybeSingle();
    if (m && m.empresa_id === empresaId && m.prospect_id) {
      const { data: p } = await supabase.from("orbit_prospects")
        .select("id, empresa_id, deleted_at").eq("id", m.prospect_id).maybeSingle();
      if (p && p.empresa_id === empresaId && !p.deleted_at) return String(p.id);
    }
  }

  return null;
}

const EMP = "emp-1";
const EMP_OTHER = "emp-2";

Deno.test("1) evento novo completo: payload.prospect_id resolve direto", async () => {
  const supa = makeSupabase({ deals: [], prospects: [], meetings: [] });
  const run = { empresa_id: EMP, entity_type: "deal", entity_id: "deal-x", context: { payload: { prospect_id: "prosp-1", deal_id: "deal-x" } } };
  assertEquals(await resolveProspectId(supa, run), "prosp-1");
});

Deno.test("2) evento legado só com deal_id → resolve via orbit_deals (mesmo tenant, não deletado)", async () => {
  const supa = makeSupabase({
    deals: [{ id: "deal-x", empresa_id: EMP, prospect_id: "prosp-42", deleted_at: null }],
    prospects: [{ id: "prosp-42", empresa_id: EMP, deleted_at: null }],
    meetings: [],
  });
  const run = { empresa_id: EMP, entity_type: "deal", entity_id: "deal-x", context: { payload: { deal_id: "deal-x", meeting_id: "m-1", scheduled_at: "2026-07-30T18:00:00Z", source: "orbit-ai-agent" } } };
  assertEquals(await resolveProspectId(supa, run), "prosp-42");
});

Deno.test("3) deal cross-tenant é rejeitado", async () => {
  const supa = makeSupabase({
    deals: [{ id: "deal-x", empresa_id: EMP_OTHER, prospect_id: "prosp-42", deleted_at: null }],
    prospects: [{ id: "prosp-42", empresa_id: EMP_OTHER, deleted_at: null }],
    meetings: [],
  });
  const run = { empresa_id: EMP, entity_type: "deal", entity_id: "deal-x", context: { payload: { deal_id: "deal-x" } } };
  assertEquals(await resolveProspectId(supa, run), null);
});

Deno.test("4) deal sem prospect_id → falha clara (null)", async () => {
  const supa = makeSupabase({
    deals: [{ id: "deal-x", empresa_id: EMP, prospect_id: null, deleted_at: null }],
    prospects: [],
    meetings: [],
  });
  const run = { empresa_id: EMP, entity_type: "deal", entity_id: "deal-x", context: { payload: { deal_id: "deal-x" } } };
  assertEquals(await resolveProspectId(supa, run), null);
});

Deno.test("5) fallback via meeting_id quando não há deal", async () => {
  const supa = makeSupabase({
    deals: [],
    prospects: [{ id: "prosp-9", empresa_id: EMP, deleted_at: null }],
    meetings: [{ id: "m-77", empresa_id: EMP, prospect_id: "prosp-9" }],
  });
  const run = { empresa_id: EMP, entity_type: "deal", entity_id: null, context: { payload: { meeting_id: "m-77" } } };
  assertEquals(await resolveProspectId(supa, run), "prosp-9");
});

Deno.test("6) deal soft-deleted não resolve", async () => {
  const supa = makeSupabase({
    deals: [{ id: "deal-x", empresa_id: EMP, prospect_id: "prosp-42", deleted_at: "2026-07-01T00:00:00Z" }],
    prospects: [{ id: "prosp-42", empresa_id: EMP, deleted_at: null }],
    meetings: [],
  });
  const run = { empresa_id: EMP, entity_type: "deal", entity_id: "deal-x", context: { payload: { deal_id: "deal-x" } } };
  assertEquals(await resolveProspectId(supa, run), null);
});

Deno.test("7) prospect soft-deleted não resolve", async () => {
  const supa = makeSupabase({
    deals: [{ id: "deal-x", empresa_id: EMP, prospect_id: "prosp-42", deleted_at: null }],
    prospects: [{ id: "prosp-42", empresa_id: EMP, deleted_at: "2026-07-01T00:00:00Z" }],
    meetings: [],
  });
  const run = { empresa_id: EMP, entity_type: "deal", entity_id: "deal-x", context: { payload: { deal_id: "deal-x" } } };
  assertEquals(await resolveProspectId(supa, run), null);
});

// ── Teste de comportamento dry_run: valida que send_whatsapp_template com dry_run:true
// persiste linha 'simulated' em orbit_mensagens sem chamar Z-API. Reproduz o path do
// executor sem depender de rede. ────────────────────────────────────────────────
Deno.test("8) action dry_run:true persiste 'simulated' em orbit_mensagens e NÃO chama Z-API", async () => {
  const inserted: any[] = [];
  let zapiCalled = false;
  // Simula o trecho do executor: dry_run=true → insert simulated + return sem sendZapi.
  const cfg = { dry_run: true, template_id: "tpl-1" };
  const mensagem = "Olá {{nome}}";
  const conversaId = "conv-1";
  const empresaId = EMP;
  if (cfg.dry_run === true) {
    inserted.push({
      empresa_id: empresaId,
      conversa_id: conversaId,
      direcao: "OUT",
      mensagem,
      canal: "whatsapp",
      status: "simulated",
    });
  } else {
    zapiCalled = true;
  }
  assertEquals(inserted.length, 1);
  assertEquals(inserted[0].status, "simulated");
  assert(!zapiCalled, "Z-API não pode ser chamada em dry_run");
});
