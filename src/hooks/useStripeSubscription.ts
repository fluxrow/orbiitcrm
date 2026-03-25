import { useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

interface CheckoutParams {
  empresaId: string;
  priceId: string;
  successUrl?: string;
  cancelUrl?: string;
}

interface PortalParams {
  empresaId: string;
  returnUrl?: string;
}

interface StatusParams {
  empresaId: string;
}

async function invokeFunction(name: string, body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke(name, { body });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return data;
}

export function useStripeCheckout() {
  return useMutation({
    mutationFn: async ({ empresaId, priceId, successUrl, cancelUrl }: CheckoutParams) => {
      const data = await invokeFunction("stripe-checkout", {
        empresa_id: empresaId,
        price_id: priceId,
        success_url: successUrl,
        cancel_url: cancelUrl,
      });
      if (data.url) {
        window.location.href = data.url;
      }
      return data;
    },
  });
}

export function useStripePortal() {
  return useMutation({
    mutationFn: async ({ empresaId, returnUrl }: PortalParams) => {
      const data = await invokeFunction("stripe-portal", {
        empresa_id: empresaId,
        return_url: returnUrl,
      });
      if (data.url) {
        window.location.href = data.url;
      }
      return data;
    },
  });
}

export function useStripeSubscriptionStatus() {
  return useMutation({
    mutationFn: async ({ empresaId }: StatusParams) => {
      return invokeFunction("stripe-subscription-status", {
        empresa_id: empresaId,
      });
    },
  });
}

interface ChangePlanParams {
  empresaId: string;
  newPriceId: string;
}

export function useStripeChangePlan() {
  return useMutation({
    mutationFn: async ({ empresaId, newPriceId }: ChangePlanParams) => {
      return invokeFunction("stripe-change-plan", {
        empresa_id: empresaId,
        new_price_id: newPriceId,
      });
    },
  });
}
