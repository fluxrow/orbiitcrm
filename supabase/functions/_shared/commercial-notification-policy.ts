import { isBullinkTenant } from "./bullink-conversation-guard.ts";

export type CommercialNotificationClassification =
  | "intencao_compra_verificada"
  | "orcamento_pronto"
  | string;

export interface CommercialNotificationPolicyInput {
  empresaId: string | null | undefined;
  commercialV2Enabled: boolean;
  verifiedPurchaseIntent: boolean;
  genericCommercialSignal: boolean;
  quoteReadySignal: boolean;
  genericClassification: string;
  alreadyNotified: boolean;
  suppressHandoff: boolean;
  scheduleHandoffReady: boolean;
}

export interface CommercialNotificationPolicyDecision {
  shouldNotify: boolean;
  classification: CommercialNotificationClassification;
}

/**
 * Política do alerta comercial interno.
 *
 * Bullink é deliberadamente fail-closed: o alerta genérico só existe para uma
 * intenção de compra determinística. Dúvida, interesse, pedido de link sem
 * finalidade de pagamento, agendamento e pedido de humano não autorizam esse
 * alerta. Notificações dedicadas de comprovante/pagamento seguem fluxos próprios.
 */
export function resolveCommercialNotificationPolicy(
  input: CommercialNotificationPolicyInput,
): CommercialNotificationPolicyDecision {
  const gatesOpen =
    !input.alreadyNotified &&
    !input.suppressHandoff &&
    !input.scheduleHandoffReady;

  if (isBullinkTenant(input.empresaId)) {
    const verifiedPurchaseIntent =
      input.commercialV2Enabled && input.verifiedPurchaseIntent;
    return {
      shouldNotify: gatesOpen && verifiedPurchaseIntent,
      classification: "intencao_compra_verificada",
    };
  }

  return {
    shouldNotify:
      gatesOpen && (input.genericCommercialSignal || input.quoteReadySignal),
    classification: input.quoteReadySignal
      ? "orcamento_pronto"
      : input.genericClassification,
  };
}

export function commercialNotificationTitle(classification: string): string {
  if (classification === "intencao_compra_verificada") {
    return "Intenção de compra verificada";
  }
  if (classification === "venda_fechada") return "Venda confirmada";
  if (classification === "pagamento_recebido") return "Comprovante de pagamento recebido";
  if (classification === "agendar_call") return "Call agendada";
  if (classification === "falar_humano") return "Lead pediu atendimento humano";
  if (classification === "pagamento_misto") return "Lead pediu pagamento misto (PIX + cartão)";
  if (classification === "orcamento_pronto") return "Orçamento pronto para análise";
  return "Novo sinal comercial";
}
