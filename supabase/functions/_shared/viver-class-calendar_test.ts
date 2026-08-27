import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  selectAuthoritativeViverClassEvent,
  viverClassLookupWindow,
} from "./viver-class-calendar.ts";

const canonical = "https://meet.google.com/esz-wgwt-pge";
const now = new Date("2026-08-26T12:00:00.000Z");

function event(overrides: Record<string, unknown> = {}) {
  return {
    id: "official-instance",
    status: "confirmed",
    start: { dateTime: "2026-09-01T22:30:00.000Z" },
    hangoutLink: canonical,
    ...overrides,
  };
}

Deno.test("seleciona apenas a próxima terça às 19h30 com Meet canônico", () => {
  const result = selectAuthoritativeViverClassEvent(
    [
      event({
        id: "wrong-time",
        start: { dateTime: "2026-09-01T21:30:00.000Z" },
      }),
      event({
        id: "wrong-link",
        hangoutLink: "https://meet.google.com/outro-link",
      }),
      event(),
    ],
    canonical,
    now,
  );
  assertEquals(result.event?.id, "official-instance");
  assertEquals(result.reason, undefined);
});

Deno.test("aceita link canônico no entry point de vídeo", () => {
  const result = selectAuthoritativeViverClassEvent(
    [event({
      hangoutLink: null,
      conferenceData: {
        entryPoints: [{
          entryPointType: "video",
          uri: `${canonical}?authuser=0`,
        }],
      },
    })],
    canonical,
    now,
  );
  assertEquals(result.event?.id, "official-instance");
});

Deno.test("falha fechado se o evento estiver ausente ou ambíguo", () => {
  assertEquals(
    selectAuthoritativeViverClassEvent([], canonical, now).reason,
    "class_calendar_event_not_found",
  );
  assertEquals(
    selectAuthoritativeViverClassEvent(
      [
        event({ id: "a" }),
        event({ id: "b" }),
      ],
      canonical,
      now,
    ).reason,
    "class_calendar_event_ambiguous",
  );
});

Deno.test("janela de busca cobre somente os próximos oito dias", () => {
  assertEquals(viverClassLookupWindow(now), {
    timeMin: "2026-08-26T12:00:00.000Z",
    timeMax: "2026-09-03T12:00:00.000Z",
  });
});
