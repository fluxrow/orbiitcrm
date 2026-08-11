// scripts/bullink-warmup-d1-dryrun.ts
// MEGA SMOKE 4 (dry-run puro): warm-up D1 do tenant Bullink.
// Simula 15 mensagens no D1 e prova que 10 são processáveis e 5 ficam retidas.
// NÃO toca banco, NÃO toca fila real, NÃO chama Z-API (fetch é instrumentado e deve ficar vazio).
//
// Uso: deno run -A scripts/bullink-warmup-d1-dryrun.ts config.json
//   config.json = { warmup_enabled, warmup_start_date, daily_limit, max_per_minute }

import {
  effectiveDailyLimit,
  nextAttemptForRetain,
  RETAIN_REASON_DAILY,
  simulateWarmupBatch,
} from "../supabase/functions/_shared/outbox-quota.ts";

const cfg = JSON.parse(await Deno.readTextFile(Deno.args[0]));

const fetchLog: string[] = [];
const realFetch = globalThis.fetch;
globalThis.fetch = ((input: any, init?: any) => {
  const url = typeof input === "string" ? input : input.url;
  fetchLog.push(new URL(url).host);
  return realFetch(input, init);
}) as typeof fetch;

const fails: string[] = [];
const check = (name: string, cond: boolean) => {
  if (!cond) fails.push(name);
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}`);
};

// D1 = dia do início do warm-up.
const now = new Date(`${String(cfg.warmup_start_date).slice(0, 10)}T14:00:00-03:00`);
const effective = effectiveDailyLimit(cfg, now);

// 15 itens no D1, sem limite de minuto (isolamos a cota diária).
const items = Array.from({ length: 15 }, (_, i) => ({
  id: `sim-${i + 1}`,
  source_type: i % 3 === 0 ? "flow_initial" : i % 3 === 1 ? "flow_followup" : "campaign",
  payload_type: "text",
}));

const sim = simulateWarmupBatch({ items, config: cfg, sent_today: 0, max_per_minute: null, now });

console.log("\n=== MEGA SMOKE 4 — WARM-UP D1 (dry_run) ===");
console.log(`config: warmup_enabled=${cfg.warmup_enabled} start=${cfg.warmup_start_date} daily_limit=${cfg.daily_limit} max_per_minute=${cfg.max_per_minute}`);
console.log(`warmup_day=${effective.warmup_day} ramp=${effective.ramp_value} limite_efetivo=${effective.limit} source=${effective.source}`);
for (const d of sim.decisions) {
  console.log(`  ${d.id.padEnd(7)} ${d.source_type.padEnd(15)} -> ${d.decision}${d.reason ? ` (${d.reason})` : ""}`);
}
console.log(`processáveis=${sim.sent.length} retidas=${sim.retained.length}`);
console.log(`retidas reagendadas para: ${nextAttemptForRetain(RETAIN_REASON_DAILY, now)}`);

check("D4 warm-up ativo e no dia 1", effective.warmup_day === 1);
check("D4 limite efetivo do D1 = 10", effective.limit === 10);
check("D4 10 mensagens processáveis", sim.sent.length === 10);
check("D4 5 mensagens retidas", sim.retained.length === 5);
check("D4 retenções por cota diária de warm-up", sim.retained.every((r) => r.reason === RETAIN_REASON_DAILY));
check("D4 retenção sem bypass por origem", new Set(sim.retained.map((r) => r.source_type)).size >= 2);

// Ritmo absoluto: 1–2 por minuto.
const perMinute = Number(cfg.max_per_minute);
check("D4 ritmo absoluto entre 1 e 2 por minuto", perMinute >= 1 && perMinute <= 2);
const rate = simulateWarmupBatch({ items: items.slice(0, 5), config: cfg, sent_today: 0, sent_last_minute: 0, max_per_minute: perMinute, now });
console.log(`janela de 60s: processáveis=${rate.sent.length} retidas=${rate.retained.length}`);
check(`D4 janela de 60s libera no máximo ${perMinute}`, rate.sent.length === perMinute);

const hosts = Array.from(new Set(fetchLog));
console.log("\nHOSTS CHAMADOS: " + (hosts.length ? hosts.join(", ") : "(nenhum)"));
check("ZERO chamada externa (inclusive Z-API)", hosts.length === 0);

console.log("\nRESUMO: " + (fails.length === 0 ? "TODOS OS CHECKS PASSARAM" : `FALHAS: ${fails.join(" | ")}`));
if (fails.length) Deno.exit(1);
