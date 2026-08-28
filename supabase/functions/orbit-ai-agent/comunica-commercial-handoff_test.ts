import {
  assert,
  assertEquals,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  COMUNICA_EMPRESA_ID,
  comunicaQuoteReady,
  enforceComunicaNotificationTruth,
  normalizeQualificationFields,
  requiredQualificationMissing,
} from "./comunica-commercial-handoff.ts";

Deno.test("normaliza campos de qualificação legados em objeto", () => {
  const fields = normalizeQualificationFields({
    prazo: { label: "Prazo desejado", required: true },
    arte_pronta: { label: "Arte pronta", required: false },
  });
  assertEquals(fields, [
    {
      key: "prazo",
      label: "Prazo desejado",
      pergunta: "Prazo desejado",
      tipo: "text",
      required: true,
    },
    {
      key: "arte_pronta",
      label: "Arte pronta",
      pergunta: "Arte pronta",
      tipo: "text",
      required: false,
    },
  ]);
});

Deno.test("preserva contrato em array e opções", () => {
  const fields = normalizeQualificationFields([
    {
      key: "escopo",
      label: "Escopo",
      pergunta: "Qual escopo?",
      tipo: "select",
      required: true,
      opcoes: ["produção", "instalação"],
    },
  ]);
  assertEquals(fields[0].key, "escopo");
  assertEquals(fields[0].opcoes, ["produção", "instalação"]);
});

Deno.test("considera respostas existentes, coletadas e do turno atual", () => {
  const fields = normalizeQualificationFields({
    produto: { required: true },
    prazo: { required: true },
    cidade: { required: true },
  });
  const missing = requiredQualificationMissing(
    fields,
    { produto: "banner" },
    { prazo: "sexta" },
    { cidade: "Curitiba" },
  );
  assertEquals(missing, []);
});

Deno.test("Comunica só fica pronta com cadastro, coleta e todos os obrigatórios", () => {
  const fields = normalizeQualificationFields({
    prazo: { label: "Prazo", required: true },
  });
  assertEquals(
    comunicaQuoteReady({
      empresaId: COMUNICA_EMPRESA_ID,
      collectingQuote: true,
      baseRegistrationComplete: true,
      fields,
      extractedAnswers: { prazo: "amanhã" },
    }).ready,
    true,
  );
  assertEquals(
    comunicaQuoteReady({
      empresaId: COMUNICA_EMPRESA_ID,
      collectingQuote: true,
      baseRegistrationComplete: true,
      fields,
    }).ready,
    false,
  );
  assertEquals(
    comunicaQuoteReady({
      empresaId: "outro-tenant",
      collectingQuote: true,
      baseRegistrationComplete: true,
      fields,
      extractedAnswers: { prazo: "amanhã" },
    }).ready,
    false,
  );
});

Deno.test("só confirma encaminhamento após notificação aceita", () => {
  const sent = enforceComunicaNotificationTruth({
    empresaId: COMUNICA_EMPRESA_ID,
    response: "Vou encaminhar.",
    quoteReady: true,
    notificationAttempted: true,
    notificationSent: true,
    alreadyNotified: false,
  });
  assert(sent.text.includes("já encaminhei"));

  const failed = enforceComunicaNotificationTruth({
    empresaId: COMUNICA_EMPRESA_ID,
    response: "Vou encaminhar.",
    quoteReady: true,
    notificationAttempted: true,
    notificationSent: false,
    alreadyNotified: false,
  });
  assert(!failed.text.includes("encaminh"));
  assertEquals(failed.reason, "notification_failed");
});

Deno.test("bloqueia promessa prematura e não altera outros tenants", () => {
  const incomplete = enforceComunicaNotificationTruth({
    empresaId: COMUNICA_EMPRESA_ID,
    response: "Vou encaminhar para a equipe.",
    quoteReady: false,
    notificationAttempted: false,
    notificationSent: false,
    alreadyNotified: false,
    nextMissingLabel: "Prazo desejado",
  });
  assertEquals(
    incomplete.text,
    "Para eu concluir o pedido, preciso confirmar prazo desejado.",
  );

  const other = enforceComunicaNotificationTruth({
    empresaId: "outro-tenant",
    response: "Vou encaminhar para a equipe.",
    quoteReady: false,
    notificationAttempted: false,
    notificationSent: false,
    alreadyNotified: false,
  });
  assertEquals(other.changed, false);
  assertEquals(other.text, "Vou encaminhar para a equipe.");
});
