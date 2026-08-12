import { assertEquals } from "https://deno.land/std@0.190.0/testing/asserts.ts";
import { evaluateBusinessHours, isAlwaysOn } from "./business-hours.ts";

const BULLINK = {
  responder_fora_horario: true,
  horario_inicio: "09:00:00",
  horario_fim: "23:00:00",
  mensagem_fora_horario:
    "Recebi sua mensagem. Assim que eu estiver disponível, continuo nossa conversa por aqui.",
};

const LEGACY = {
  responder_fora_horario: false,
  horario_inicio: "09:00:00",
  horario_fim: "20:00:00",
  mensagem_fora_horario: "Fora do horário.",
};

// BH1: 24h ligado fora da janela => segue geração normal, sem fallback.
Deno.test("BH1 always_on ignora janela (03:12)", () => {
  const d = evaluateBusinessHours(BULLINK, "03:12");
  assertEquals(d.halt, false);
  assertEquals(d.fallbackMessage, null);
  assertEquals(d.reason, "always_on");
});

// BH2: 24h ligado dentro da janela => normal.
Deno.test("BH2 always_on dentro da janela", () => {
  assertEquals(evaluateBusinessHours(BULLINK, "10:00").halt, false);
});

// BH3: tenant legado fora da janela => halt + fallback.
Deno.test("BH3 legado fora da janela envia fallback", () => {
  const d = evaluateBusinessHours(LEGACY, "23:30");
  assertEquals(d.halt, true);
  assertEquals(d.fallbackMessage, "Fora do horário.");
  assertEquals(d.reason, "outside_hours");
});

// BH4: tenant legado dentro da janela => normal.
Deno.test("BH4 legado dentro da janela", () => {
  assertEquals(evaluateBusinessHours(LEGACY, "09:00").halt, false);
  assertEquals(evaluateBusinessHours(LEGACY, "20:00").halt, false);
});

// BH5: legado sem mensagem configurada => halt sem fallback.
Deno.test("BH5 legado sem mensagem", () => {
  const d = evaluateBusinessHours({ ...LEGACY, mensagem_fora_horario: "  " }, "07:00");
  assertEquals(d.halt, true);
  assertEquals(d.fallbackMessage, null);
});

// BH6: flag ausente/null => comportamento legado (defaults 08:00-18:00).
Deno.test("BH6 flag ausente usa defaults", () => {
  assertEquals(isAlwaysOn({}), false);
  assertEquals(evaluateBusinessHours({}, "19:00").halt, true);
  assertEquals(evaluateBusinessHours({}, "12:00").halt, false);
});

// BH7: valores truthy não booleanos não ativam 24h (opt-in estrito).
Deno.test("BH7 opt-in estrito", () => {
  assertEquals(isAlwaysOn({ responder_fora_horario: null }), false);
  assertEquals(isAlwaysOn({ responder_fora_horario: true }), true);
});
