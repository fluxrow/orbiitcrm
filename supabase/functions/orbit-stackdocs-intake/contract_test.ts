import {
  constantTimeHexEqual,
  hmacHex,
  parseTimestamp,
  sha256Hex,
  utf8ByteLength,
  validateEnvelope,
  verifyHmac,
} from "./contract.ts";

const envelope = {
  event_id: "evt_example_completed_001",
  event_type: "stackdocs.submission.completed",
  schema_version: "1.0",
  occurred_at: "2026-08-21T12:00:00.000Z",
  source: "stackdocs",
  connection_id: "conn_example_001",
  correlation_id: "corr_example_response_001",
  subject: {
    organization_id: "org_example_001",
    form_id: "form_example_001",
    response_id: "resp_example_001",
  },
  payload: {
    status: "completed",
    lead: {
      name: "Pessoa Exemplo",
      phone: "+5511000000000",
      email: "pessoa@example.invalid",
      document: null,
      consent: {
        status: "granted",
        captured_at: "2026-08-21T12:00:00.000Z",
        purpose: "lead_intake",
      },
    },
    answers: { field_example: "valor sanitizado" },
    attribution: { source: "fixture" },
    attachments: [],
  },
};

Deno.test("validates the normative StackDocs envelope", () => {
  validateEnvelope(envelope);
});

Deno.test("rejects operational and unknown fields", () => {
  const invalid = { ...envelope, tenant_id: "forbidden" };
  let rejected = false;
  try {
    validateEnvelope(invalid);
  } catch {
    rejected = true;
  }
  if (!rejected) throw new Error("unknown field was accepted");
});

Deno.test("matches the shared StackDocs HMAC vector", async () => {
  const timestamp = "1787313600";
  const rawBody = "{\"connection_id\":\"conn_example_001\",\"correlation_id\":\"corr_example_response_001\",\"event_id\":\"evt_example_completed_001\",\"event_type\":\"stackdocs.submission.completed\",\"occurred_at\":\"2026-08-21T12:00:00.000Z\",\"payload\":{\"answers\":{\"field_example\":\"valor sanitizado\"},\"attachments\":[{\"attachment_id\":\"att_example_001\",\"content_type\":\"application/pdf\",\"download_url\":\"https://files.example.invalid/temporary/example.pdf\",\"expires_at\":\"2026-08-21T12:15:00.000Z\",\"filename\":\"example.pdf\",\"sha256\":\"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\",\"size_bytes\":1024}],\"attribution\":{\"campaign\":\"orbit-v1\",\"content\":\"sanitized-example\",\"medium\":\"contract-test\",\"referrer\":\"https://stackdocs.example.invalid/form/example\",\"source\":\"fixture\",\"term\":\"conversational-form\"},\"lead\":{\"consent\":{\"captured_at\":\"2026-08-21T12:00:00.000Z\",\"purpose\":\"lead_intake\",\"status\":\"granted\"},\"document\":null,\"email\":\"pessoa@example.invalid\",\"name\":\"Pessoa Exemplo\",\"phone\":\"+5511000000000\"},\"status\":\"completed\"},\"schema_version\":\"1.0\",\"source\":\"stackdocs\",\"subject\":{\"form_id\":\"form_example_001\",\"organization_id\":\"org_example_001\",\"response_id\":\"resp_example_001\"}}";
  const expected = "89f754fa2e36b67424a6313b74e95e0f45cb567cddb1394731f9408d676062ec";
  const actual = await hmacHex("orbit-v1-test-secret-not-for-production", timestamp, rawBody);
  if (actual !== expected) throw new Error(`HMAC mismatch: ${actual}`);
  if (!await verifyHmac(`v1=${expected}`, timestamp, rawBody, ["orbit-v1-test-secret-not-for-production"])) {
    throw new Error("valid HMAC rejected");
  }
});

Deno.test("enforces anti-replay timestamp window", () => {
  const now = 1_787_313_600_000;
  if (parseTimestamp("1787313600", now, 300) !== "1787313600") throw new Error("valid timestamp rejected");
  let rejected = false;
  try {
    parseTimestamp("1787313299", now, 300);
  } catch {
    rejected = true;
  }
  if (!rejected) throw new Error("expired timestamp accepted");
});

Deno.test("hashes and compares without coercion", async () => {
  if (await sha256Hex("Orbit") !== "29ac7e56b3b4654f52463cbf0f7b5fc7f299dd24ba9583c0c9f3a51832a9f073") {
    throw new Error("SHA-256 mismatch");
  }
  if (!constantTimeHexEqual("a".repeat(64), "a".repeat(64))) throw new Error("equal digest rejected");
  if (constantTimeHexEqual("a".repeat(64), "b".repeat(64))) throw new Error("different digest accepted");
  if (utf8ByteLength("ação") !== 6) throw new Error("UTF-8 length mismatch");
});
