import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  buildCanonicalMeetingConfirmation, classifyMeeting, enforceFreshMeetingState,
  expiredMeetingIdsForReconciliation, formatMeetingAuthorityBlock,
  inboundExplicitlyRequestsMeetingLink, selectAuthoritativeMeeting, shouldCancelPastReminder,
} from "./viver-meeting-guard.ts";

const meeting = (overrides: Record<string, unknown> = {}) => ({
  id: "0010b897-cd5d-43f1-8844-64d64c940015",
  scheduled_at: "2026-08-25T15:00:00.000Z",
  duration_minutes: 60,
  status: "scheduled",
  meeting_url: "https://meet.google.com/example",
  ...overrides,
});

Deno.test("reunião é futura somente antes do início", () => {
  assertEquals(classifyMeeting(meeting(), new Date("2026-08-25T14:59:59Z")), "upcoming");
});

Deno.test("reunião fica em andamento do início até antes do término", () => {
  assertEquals(classifyMeeting(meeting(), new Date("2026-08-25T15:00:00Z")), "in_progress");
  assertEquals(classifyMeeting(meeting(), new Date("2026-08-25T15:59:59Z")), "in_progress");
});

Deno.test("scheduled vencida é encerrada exatamente no término", () => {
  assertEquals(classifyMeeting(meeting(), new Date("2026-08-25T16:00:00Z")), "expired");
});

Deno.test("seleção prioriza próxima futura e não a histórica mais recente", () => {
  const selected = selectAuthoritativeMeeting([
    meeting({ id: "old", scheduled_at: "2026-08-25T15:00:00Z" }),
    meeting({ id: "future", scheduled_at: "2026-08-27T18:00:00Z" }),
  ], new Date("2026-08-25T20:00:00Z"));
  assertEquals(selected?.meeting.id, "future");
  assertEquals(selected?.phase, "upcoming");
});

Deno.test("fuso America/Sao_Paulo aparece no contexto autoritativo", () => {
  const selected = selectAuthoritativeMeeting([meeting()], new Date("2026-08-25T14:00:00Z"));
  const block = formatMeetingAuthorityBlock(selected, new Date("2026-08-25T14:00:00Z"));
  assert(block.includes("America/Sao_Paulo"));
  assert(block.includes("12:00"));
  assert(block.includes("13:00"));
});

Deno.test("bloqueia reenvio de link e linguagem futura após término", () => {
  const selected = selectAuthoritativeMeeting([meeting()], new Date("2026-08-25T19:23:00Z"));
  for (const text of [
    "Nos vemos terça às 12h!",
    "Qualquer dúvida até lá.",
    "Segue o link https://meet.google.com/example",
  ]) {
    const guarded = enforceFreshMeetingState(text, selected);
    assertEquals(guarded.changed, true);
    assert(!guarded.text.includes("meet.google.com"));
  }
});

Deno.test("durante reunião permite link pedido, mas bloqueia despedida futura", () => {
  const selected = selectAuthoritativeMeeting([meeting()], new Date("2026-08-25T15:30:00Z"));
  assertEquals(enforceFreshMeetingState("Link: https://meet.google.com/example", selected, { latestInboundAskedForLink: true }).changed, false);
  assertEquals(enforceFreshMeetingState("Nos vemos mais tarde, até lá!", selected).changed, true);
});

Deno.test("reunião futura aceita apenas o link autoritativo exato", () => {
  const selected = selectAuthoritativeMeeting([meeting()], new Date("2026-08-25T14:00:00Z"));
  assertEquals(enforceFreshMeetingState("Link: https://meet.google.com/example", selected).changed, false);
  const historical = enforceFreshMeetingState("Link: https://meet.google.com/historico", selected);
  assertEquals(historical.changed, true);
  assertEquals(historical.reason, "non_authoritative_meeting_link");
});

Deno.test("quinta às 15h substitui resposta divergente terça às 12h por confirmação canônica", () => {
  const future = meeting({ scheduled_at: "2026-08-27T18:00:00Z", meeting_url: "https://meet.google.com/quinta-correto" });
  const selected = selectAuthoritativeMeeting([future], new Date("2026-08-26T12:00:00Z"));
  const guarded = enforceFreshMeetingState("Nos vemos terça às 12h. Link: https://meet.google.com/historico", selected);
  assertEquals(guarded.changed, true);
  assertEquals(guarded.reason, "non_authoritative_meeting_link");
  assertEquals(guarded.text, buildCanonicalMeetingConfirmation(future));
  assert(guarded.text.includes("quinta-feira, 27/08/2026, às 15:00"));
  assert(guarded.text.includes("https://meet.google.com/quinta-correto"));
  assert(!guarded.text.includes("historico"));
});

Deno.test("data, dia e horário autoritativos são preservados", () => {
  const future = meeting({ scheduled_at: "2026-08-27T18:00:00Z", meeting_url: "https://meet.google.com/quinta-correto" });
  const selected = selectAuthoritativeMeeting([future], new Date("2026-08-26T12:00:00Z"));
  const correct = "Sua reunião está marcada para quinta-feira, 27/08/2026, às 15h. Link: https://meet.google.com/quinta-correto";
  assertEquals(enforceFreshMeetingState(correct, selected), { text: correct, changed: false });
});

Deno.test("reconhece frases explícitas de solicitação de link", () => {
  for (const phrase of [
    "aguardando o link",
    "onde está o link?",
    "me passa o link",
    "não recebi o link",
    "como entro na reunião?",
  ]) assertEquals(inboundExplicitlyRequestsMeetingLink(phrase), true, phrase);
});

Deno.test("reunião em andamento exige pedido inbound explícito para liberar link", () => {
  const selected = selectAuthoritativeMeeting([meeting()], new Date("2026-08-25T15:30:00Z"));
  assertEquals(enforceFreshMeetingState("Link: https://meet.google.com/example", selected).changed, true);
  assertEquals(enforceFreshMeetingState("Link: https://meet.google.com/example", selected, { latestInboundAskedForLink: true }).changed, false);
});

Deno.test("falha de consulta preserva resposta sem agenda e bloqueia somente agenda", () => {
  assertEquals(enforceFreshMeetingState("Claro, posso ajudar com isso.", null, { revalidationFailed: true }).changed, false);
  assertEquals(enforceFreshMeetingState("Nossa reunião é às 15:00.", null, { revalidationFailed: true }).changed, true);
});

Deno.test("fallback não promete handoff ou encaminhamento não persistido", () => {
  const selected = selectAuthoritativeMeeting([meeting()], new Date("2026-08-25T20:00:00Z"));
  const guarded = enforceFreshMeetingState("Nos vemos às 12h, até lá!", selected);
  assertEquals(guarded.changed, true);
  assert(!/(?:vou\s+encaminhar|encaminhei|j[aá]\s+encaminhei|passei\s+para)/iu.test(guarded.text));
  assert(guarded.text.includes("Você quer"));
});

Deno.test("reconciliação inclui só vencidas e lembrete passado é cancelável", () => {
  const now = new Date("2026-08-25T20:00:00Z");
  const future = meeting({ id: "future", scheduled_at: "2026-08-26T15:00:00Z" });
  assertEquals(expiredMeetingIdsForReconciliation([meeting(), future], now), [meeting().id]);
  assertEquals(shouldCancelPastReminder({ scheduledFor: "2026-08-25T14:00:00Z", meeting: future }, now), true);
  assertEquals(shouldCancelPastReminder({ scheduledFor: "2026-08-26T14:00:00Z", meeting: future }, now), false);
});
