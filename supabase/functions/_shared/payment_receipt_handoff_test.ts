import {
  detectPaymentReceipt,
  readPaymentReceiptHandoffConfig,
} from "./payment-receipt-handoff.ts";

function assert(value: unknown, message: string) {
  if (!value) throw new Error(message);
}

Deno.test("feature é opt-in e isolada por tenant", () => {
  assert(readPaymentReceiptHandoffConfig({}) === null, "config ausente deve desligar");
  assert(readPaymentReceiptHandoffConfig({ mixed_payment_handoff: { receipt_handoff: { enabled: false } } }) === null, "false deve desligar");
  const enabled = readPaymentReceiptHandoffConfig({
    mixed_payment_handoff: { receipt_handoff: { enabled: true, target_stage_name: "Negociação" } },
  });
  assert(enabled?.target_stage_name === "Negociação", "deve carregar etapa configurada");
});

Deno.test("recibo InfinitePay é evidência forte", () => {
  const result = detectPaymentReceipt([{ id: "in-1", mensagem: "https://recibo.infinitepay.io/f2590637-e9a6-40ad-9d9e-596ec8b70e95" }]);
  assert(result.detected && result.kind === "receipt_url" && result.inbound_id === "in-1", "recibo deve ser detectado");
});

Deno.test("confirmações textuais inequívocas são detectadas", () => {
  for (const mensagem of ["Segue comprovante", "Pagamento feito", "PIX realizado", "Comprovante no valor de R$ 4.199,67"]) {
    assert(detectPaymentReceipt([{ mensagem }]).detected, `deveria detectar: ${mensagem}`);
  }
});

Deno.test("imagem de comprovante processada é detectada", () => {
  const result = detectPaymentReceipt([{
    id: "img-1",
    tipo_midia: "image",
    mensagem: "📎 image",
    media_extracted_text: "Comprovante Pix. Transferência realizada com sucesso. Valor R$ 997,00.",
  }]);
  assert(result.detected && result.kind === "image_receipt", "imagem processada deve ser detectada");
});

Deno.test("não confunde link de cobrança, promessa futura ou pagamento antigo", () => {
  const negatives = [
    { mensagem: "https://link.infinitepay.io/albuquerqueadsltda/VC1D-JKIVWAm1tg-6500,00" },
    { mensagem: "te mandar o comprovante aí" },
    { mensagem: "Paguei 18k em outro curso e me arrependi" },
    { mensagem: "Você aceita pagamento no PIX?" },
    { tipo_midia: "image", media_extracted_text: "Resultado do aluno: faturamento de R$ 10 mil" },
  ];
  for (const candidate of negatives) {
    assert(!detectPaymentReceipt([candidate]).detected, `falso positivo: ${JSON.stringify(candidate)}`);
  }
});
