import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { buildMeetingTemplateVars, renderTemplateVars } from "./template-vars.ts";

Deno.test("meeting template usa as variáveis planas do contrato do executor", () => {
  const vars = buildMeetingTemplateVars({
    scheduled_at: "2026-08-28T16:00:00.000Z",
    meeting_url: "https://meet.google.com/abc-defg-hij",
    duration_minutes: 60,
  }, "America/Sao_Paulo");

  assertEquals(vars.hora_reuniao, "13:00");
  assertEquals(vars.link_reuniao, "https://meet.google.com/abc-defg-hij");
  assertEquals(vars.duracao_reuniao_minutos, 60);
});

Deno.test("lembrete matinal renderiza horário e link sem placeholder cru", () => {
  const meetingVars = buildMeetingTemplateVars({
    scheduled_at: "2026-09-23T16:00:00.000Z",
    meeting_url: "https://meet.google.com/abc-defg-hij",
  }, "America/Sao_Paulo");
  const rendered = renderTemplateVars(
    "Bom dia, {{nome}}. Nossa conversa é hoje às {{hora_reuniao}}. O acesso é este: {{link_reuniao}}",
    { nome: "Cliente", ...meetingVars },
  );
  assertEquals(rendered, "Bom dia, Cliente. Nossa conversa é hoje às 13:00. O acesso é este: https://meet.google.com/abc-defg-hij");
});
