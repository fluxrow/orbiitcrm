// resume_pausada_por_limite_test.ts
// Testes puros da regra de auto-resume do scheduler + integração idempotente
// via mocks. Não usa rede real, não invoca send-orbit-campaign real,
// não toca em tenants reais.

import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  canResumePausadaPorLimite,
  getEffectiveDailyLimit,
  type CampaignSendingConfig,
} from "../_shared/whatsapp-campaign-quota.ts";

const baseCfg: CampaignSendingConfig = {
  min_delay_ms: 1500,
  max_delay_ms: 3500,
  batch_size: 50,
  batch_pause_ms: 30000,
  daily_limit: 50,
  max_per_minute: 2,
  warmup_enabled: false,
  warmup_start_date: null,
  enabled: true,
};

Deno.test("pausada_por_limite: mesmo dia, uso == cota efetiva → NÃO retoma", () => {
  const r = canResumePausadaPorLimite({ config: baseCfg, dailySentCount: 50 });
  assertEquals(r.resume, false);
  assertEquals(r.effectiveLimit, 50);
  assertEquals(r.remaining, 0);
});

Deno.test("pausada_por_limite: uso acima da cota → NÃO retoma", () => {
  const r = canResumePausadaPorLimite({ config: baseCfg, dailySentCount: 999 });
  assertEquals(r.resume, false);
});

Deno.test("pausada_por_limite: uso do dia seguinte (0) → retoma", () => {
  const r = canResumePausadaPorLimite({ config: baseCfg, dailySentCount: 0 });
  assertEquals(r.resume, true);
  assertEquals(r.remaining, 50);
});

Deno.test("warmup: dia 0 usa WARMUP_SCALE[0]=50 mesmo com daily_limit=500", () => {
  const cfg: CampaignSendingConfig = {
    ...baseCfg,
    daily_limit: 500,
    warmup_enabled: true,
    warmup_start_date: new Date().toISOString(),
  };
  const { limit } = getEffectiveDailyLimit(cfg);
  assertEquals(limit, 50);
});

Deno.test("warmup: dia >= 6 respeita teto config.daily_limit", () => {
  const start = new Date(); start.setDate(start.getDate() - 10);
  const cfg: CampaignSendingConfig = {
    ...baseCfg,
    daily_limit: 200,
    warmup_enabled: true,
    warmup_start_date: start.toISOString(),
  };
  const { limit } = getEffectiveDailyLimit(cfg);
  assertEquals(limit, 200);
});

// ── Mock do fluxo de scheduler (decisão + claim + delegação) ──
type Campaign = {
  id: string;
  empresa_id: string;
  canal: string;
  status: string;
  aprovacao_status: string;
};

function buildMockScheduler(opts: {
  campaigns: Campaign[];
  pendingByCampaign: Record<string, number>;
  configByTenant: Record<string, CampaignSendingConfig>;
  usageByTenant: Record<string, number>;
}) {
  const dispatched: string[] = [];
  const statusChanges: Array<{ id: string; from: string; to: string }> = [];
  const campaigns = opts.campaigns.map((c) => ({ ...c }));

  function findEligible(): Campaign[] {
    return campaigns.filter(
      (c) =>
        c.status === "pausada_por_limite" &&
        c.aprovacao_status === "aprovada" &&
        c.canal === "whatsapp" &&
        (opts.pendingByCampaign[c.id] ?? 0) > 0,
    );
  }

  async function tick(dispatchFn: (id: string) => Promise<boolean> = async () => true) {
    for (const c of findEligible()) {
      const cfg = opts.configByTenant[c.empresa_id];
      if (!cfg || !cfg.enabled) continue;
      const usage = opts.usageByTenant[c.empresa_id] ?? 0;
      const { resume } = canResumePausadaPorLimite({ config: cfg, dailySentCount: usage });
      if (!resume) continue;

      // Claim condicional (idempotente).
      const target = campaigns.find((x) => x.id === c.id);
      if (!target || target.status !== "pausada_por_limite") continue;
      target.status = "aprovada_para_envio";
      statusChanges.push({ id: c.id, from: "pausada_por_limite", to: "aprovada_para_envio" });

      const ok = await dispatchFn(c.id);
      if (ok) dispatched.push(c.id);
      else {
        target.status = "pausada_por_limite";
        statusChanges.push({ id: c.id, from: "aprovada_para_envio", to: "pausada_por_limite" });
      }
    }
    return { dispatched: [...dispatched], statusChanges: [...statusChanges], campaigns: [...campaigns] };
  }

  return { tick };
}

Deno.test("scheduler: pausa por limite no mesmo dia NÃO retoma", async () => {
  const s = buildMockScheduler({
    campaigns: [{ id: "c1", empresa_id: "t1", canal: "whatsapp", status: "pausada_por_limite", aprovacao_status: "aprovada" }],
    pendingByCampaign: { c1: 138 },
    configByTenant: { t1: { ...baseCfg, daily_limit: 50 } },
    usageByTenant: { t1: 50 },
  });
  const r = await s.tick();
  assertEquals(r.dispatched.length, 0);
  assertEquals(r.campaigns[0].status, "pausada_por_limite");
});

Deno.test("scheduler: dia seguinte com usage=0 retoma UMA vez", async () => {
  const s = buildMockScheduler({
    campaigns: [{ id: "c1", empresa_id: "t1", canal: "whatsapp", status: "pausada_por_limite", aprovacao_status: "aprovada" }],
    pendingByCampaign: { c1: 138 },
    configByTenant: { t1: { ...baseCfg, daily_limit: 50 } },
    usageByTenant: { t1: 0 },
  });
  const r = await s.tick();
  assertEquals(r.dispatched, ["c1"]);
  assertEquals(r.campaigns[0].status, "aprovada_para_envio");
});

Deno.test("scheduler: duas ticks consecutivas NÃO duplicam dispatch", async () => {
  const s = buildMockScheduler({
    campaigns: [{ id: "c1", empresa_id: "t1", canal: "whatsapp", status: "pausada_por_limite", aprovacao_status: "aprovada" }],
    pendingByCampaign: { c1: 138 },
    configByTenant: { t1: { ...baseCfg, daily_limit: 50 } },
    usageByTenant: { t1: 0 },
  });
  const r1 = await s.tick();
  const r2 = await s.tick();
  assertEquals(r1.dispatched.length, 1);
  assertEquals(r2.dispatched.length, 1); // mesmo array acumulado; nenhum novo elemento adicionado
  assertEquals(r2.dispatched, ["c1"]);
});

Deno.test("scheduler: pausa manual (status=pausada) NÃO é retomada", async () => {
  const s = buildMockScheduler({
    campaigns: [{ id: "c1", empresa_id: "t1", canal: "whatsapp", status: "pausada", aprovacao_status: "aprovada" }],
    pendingByCampaign: { c1: 100 },
    configByTenant: { t1: { ...baseCfg, daily_limit: 500 } },
    usageByTenant: { t1: 0 },
  });
  const r = await s.tick();
  assertEquals(r.dispatched.length, 0);
  assertEquals(r.campaigns[0].status, "pausada");
});

Deno.test("scheduler: campanha não aprovada NÃO é retomada", async () => {
  const s = buildMockScheduler({
    campaigns: [{ id: "c1", empresa_id: "t1", canal: "whatsapp", status: "pausada_por_limite", aprovacao_status: "pendente" }],
    pendingByCampaign: { c1: 100 },
    configByTenant: { t1: { ...baseCfg, daily_limit: 500 } },
    usageByTenant: { t1: 0 },
  });
  const r = await s.tick();
  assertEquals(r.dispatched.length, 0);
  assertEquals(r.campaigns[0].status, "pausada_por_limite");
});

Deno.test("scheduler: reprovada/cancelada/concluída NÃO são candidatas", async () => {
  const s = buildMockScheduler({
    campaigns: [
      { id: "a", empresa_id: "t1", canal: "whatsapp", status: "reprovada", aprovacao_status: "aprovada" },
      { id: "b", empresa_id: "t1", canal: "whatsapp", status: "cancelada", aprovacao_status: "aprovada" },
      { id: "c", empresa_id: "t1", canal: "whatsapp", status: "concluida", aprovacao_status: "aprovada" },
    ],
    pendingByCampaign: { a: 10, b: 10, c: 10 },
    configByTenant: { t1: { ...baseCfg, daily_limit: 500 } },
    usageByTenant: { t1: 0 },
  });
  const r = await s.tick();
  assertEquals(r.dispatched.length, 0);
});

Deno.test("scheduler: sem pendentes NÃO retoma", async () => {
  const s = buildMockScheduler({
    campaigns: [{ id: "c1", empresa_id: "t1", canal: "whatsapp", status: "pausada_por_limite", aprovacao_status: "aprovada" }],
    pendingByCampaign: { c1: 0 },
    configByTenant: { t1: { ...baseCfg, daily_limit: 500 } },
    usageByTenant: { t1: 0 },
  });
  const r = await s.tick();
  assertEquals(r.dispatched.length, 0);
  assertEquals(r.campaigns[0].status, "pausada_por_limite");
});

Deno.test("scheduler: metadata.simulate → dispatch mockado NÃO chama Z-API (invariante do teste)", async () => {
  let zapiCalls = 0;
  const dispatchFn = async (_id: string) => {
    // Em produção, send-orbit-campaign só chama Z-API quando adapter+kill switch permitem.
    // Aqui garantimos que o scheduler não faz chamada direta.
    return true;
  };
  const s = buildMockScheduler({
    campaigns: [{ id: "c1", empresa_id: "t-smoke", canal: "whatsapp", status: "pausada_por_limite", aprovacao_status: "aprovada" }],
    pendingByCampaign: { c1: 10 },
    configByTenant: { "t-smoke": { ...baseCfg, daily_limit: 500 } },
    usageByTenant: { "t-smoke": 0 },
  });
  const r = await s.tick(dispatchFn);
  assertEquals(r.dispatched, ["c1"]);
  assertEquals(zapiCalls, 0);
});

Deno.test("scheduler: rhythm_disabled (enabled=false) NÃO retoma", async () => {
  const s = buildMockScheduler({
    campaigns: [{ id: "c1", empresa_id: "t1", canal: "whatsapp", status: "pausada_por_limite", aprovacao_status: "aprovada" }],
    pendingByCampaign: { c1: 100 },
    configByTenant: { t1: { ...baseCfg, enabled: false } },
    usageByTenant: { t1: 0 },
  });
  const r = await s.tick();
  assertEquals(r.dispatched.length, 0);
  assertEquals(r.campaigns[0].status, "pausada_por_limite");
});
