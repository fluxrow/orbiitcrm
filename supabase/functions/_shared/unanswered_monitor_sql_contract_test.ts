import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

const sql = await Deno.readTextFile(new URL(
  "../../migrations/20260826203438_ai_unanswered_inbound_incident_monitor.sql",
  import.meta.url,
));

Deno.test("monitor é interno, idempotente e sem ação comunicacional", () => {
  assert(sql.includes("unique (empresa_id, conversa_id, inbound_message_id, incident_type)"));
  assert(sql.includes("communicational_actions', 0"));
  assert(sql.includes("reprocessed', 0"));
  assert(sql.includes("from public, anon, authenticated"));
  assert(sql.includes("to service_role"));
  assertEquals(/net\.http_post|functions\/v1|sendOps|zapi|fetch\s*\(/i.test(sql), false);
});

Deno.test("monitor respeita posse humana, janela e respostas reais", () => {
  assert(sql.includes("coalesce(c.human_talk, false) = false"));
  assert(sql.includes("c.human_user_id is null"));
  assert(sql.includes("inside_service_window = true"));
  assert(sql.includes("mo.timestamp > li.inbound_at"));
  assert(sql.includes("not in\n            ('queued','cancelada','canceled','falhou','failed','pendente')"));
});

Deno.test("artefatos em andamento impedem falso positivo", () => {
  assert(sql.includes("x.status='running' and x.lease_expires_at>now()"));
  assert(sql.includes("d.status in ('pending','generating')"));
  assert(sql.includes("o.status in ('pending','processing','sent')"));
});

Deno.test("cron apenas chama a função de detecção", () => {
  assert(sql.includes("'orbit-ai-unanswered-monitor-v1'"));
  assert(sql.includes("'*/5 * * * *'"));
  assert(sql.includes("select public.orbit_scan_unanswered_inbounds"));
});
