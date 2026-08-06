import { describe, expect, it } from "vitest";
import { buildMeetingTemplateVars } from "../../supabase/functions/orbit-flow-executor/template-vars";

describe("buildMeetingTemplateVars", () => {
  it("formats meeting fields in the tenant timezone", () => {
    expect(
      buildMeetingTemplateVars(
        {
          scheduled_at: "2026-08-06T18:30:00.000Z",
          meeting_url: "https://meet.google.com/abc-defg-hij",
          duration_minutes: 45,
          titulo: "Diagnóstico",
        },
        "America/Sao_Paulo",
      ),
    ).toMatchObject({
      data_reuniao: "06/08/2026",
      hora_reuniao: "15:30",
      data_hora_reuniao: "06/08/2026 às 15:30",
      link_reuniao: "https://meet.google.com/abc-defg-hij",
      duracao_reuniao_minutos: 45,
      timezone_reuniao: "America/Sao_Paulo",
    });
  });

  it("respects a non-default tenant timezone", () => {
    expect(
      buildMeetingTemplateVars(
        { scheduled_at: "2026-08-06T18:30:00.000Z" },
        "America/Manaus",
      ),
    ).toMatchObject({ hora_reuniao: "14:30", timezone_reuniao: "America/Manaus" });
  });

  it("falls back safely when timezone is invalid", () => {
    expect(
      buildMeetingTemplateVars(
        { scheduled_at: "2026-08-06T18:30:00.000Z" },
        "Invalid/Timezone",
      ),
    ).toMatchObject({ hora_reuniao: "15:30", timezone_reuniao: "America/Sao_Paulo" });
  });

  it("does not invent meeting data without a valid timestamp", () => {
    expect(buildMeetingTemplateVars({}, "America/Sao_Paulo")).toEqual({});
    expect(
      buildMeetingTemplateVars({ scheduled_at: "not-a-date" }, "America/Sao_Paulo"),
    ).toEqual({});
  });
});
