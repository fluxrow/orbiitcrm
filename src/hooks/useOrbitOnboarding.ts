import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/contexts/TenantContext";

export type OnboardingStatus =
  | "rascunho" | "enviado" | "em_andamento" | "concluido" | "revisado" | "arquivado";

export interface ClientOnboarding {
  id: string;
  empresa_id: string;
  public_token: string;
  status: OnboardingStatus;
  cliente_nome: string | null;
  cliente_email: string | null;
  cliente_empresa: string | null;
  responses: Record<string, any>;
  implementation_checklist: any[];
  notes: string | null;
  sent_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  last_saved_at: string | null;
  archived: boolean;
  created_at: string;
  updated_at: string;
}

export function useClientOnboardings() {
  const { empresaId } = useTenant();
  return useQuery({
    queryKey: ["client-onboardings", empresaId],
    enabled: !!empresaId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orbit_client_onboardings" as any)
        .select("*")
        .eq("empresa_id", empresaId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as ClientOnboarding[];
    },
  });
}

export function useCreateOnboarding() {
  const qc = useQueryClient();
  const { empresaId } = useTenant();
  return useMutation({
    mutationFn: async (input: {
      cliente_nome: string;
      cliente_email: string;
      cliente_empresa?: string;
      notes?: string;
    }) => {
      if (!empresaId) throw new Error("empresa_id ausente");
      const { data, error } = await supabase.functions.invoke("orbit-onboarding-create", {
        body: { empresa_id: empresaId, ...input },
      });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.error?.message || "Falha ao criar onboarding");
      return data.data as { id: string; public_token: string; public_link: string; email_sent: boolean };
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["client-onboardings", empresaId] }),
  });
}

export function useArchiveOnboarding() {
  const qc = useQueryClient();
  const { empresaId } = useTenant();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("orbit_client_onboardings" as any)
        .update({ archived: true, status: "arquivado" })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["client-onboardings", empresaId] }),
  });
}

export function useUpdateChecklist() {
  const qc = useQueryClient();
  const { empresaId } = useTenant();
  return useMutation({
    mutationFn: async ({ id, checklist }: { id: string; checklist: any[] }) => {
      const { error } = await supabase
        .from("orbit_client_onboardings" as any)
        .update({ implementation_checklist: checklist })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["client-onboardings", empresaId] }),
  });
}

// ── Public (token-based) ──

export function usePublicOnboarding(token: string | undefined) {
  return useQuery({
    queryKey: ["public-onboarding", token],
    enabled: !!token,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_onboarding_by_token" as any, { p_token: token! });
      if (error) throw error;
      const res = data as any;
      if (!res?.ok) throw new Error(res?.error || "not_found");
      return res.data as {
        id: string;
        status: OnboardingStatus;
        cliente_nome: string | null;
        cliente_email: string | null;
        cliente_empresa: string | null;
        responses: Record<string, any>;
        sent_at: string | null;
        completed_at: string | null;
        last_saved_at: string | null;
        empresa_nome: string | null;
      };
    },
  });
}

export function useSavePublicOnboarding() {
  return useMutation({
    mutationFn: async ({ token, responses }: { token: string; responses: Record<string, any> }) => {
      const { data, error } = await supabase.rpc("save_onboarding_responses" as any, {
        p_token: token, p_responses: responses,
      });
      if (error) throw error;
      const res = data as any;
      if (!res?.ok) throw new Error(res?.error || "save_failed");
      return res.data;
    },
  });
}

export function useSubmitPublicOnboarding() {
  return useMutation({
    mutationFn: async ({ token, responses }: { token: string; responses: Record<string, any> }) => {
      const { data, error } = await supabase.functions.invoke("orbit-onboarding-submit", {
        body: { token, responses },
      });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.error?.message || "Falha ao enviar");
      return data.data;
    },
  });
}
