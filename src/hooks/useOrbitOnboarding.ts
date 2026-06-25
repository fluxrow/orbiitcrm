import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/contexts/TenantContext";
import { useIsSuperAdmin } from "@/hooks/useUserRole";

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
  empresa?: { nome: string | null; slug: string | null } | null;
}

export function useClientOnboardings() {
  const { empresaId } = useTenant();
  const { hasRole: isSuper } = useIsSuperAdmin();
  return useQuery({
    queryKey: ["client-onboardings", empresaId, isSuper],
    enabled: !!empresaId,
    queryFn: async () => {
      let q = supabase
        .from("orbit_client_onboardings" as any)
        .select("*")
        .order("created_at", { ascending: false });
      // Super admin sees onboardings of all tenants (centralized view from Fluxrow).
      // Regular users only see their own tenant's onboardings.
      if (!isSuper) q = q.eq("empresa_id", empresaId!);
      const { data, error } = await q;
      if (error) throw error;
      const rows = (data ?? []) as any[];
      const empresaIds = Array.from(new Set(rows.map((r) => r.empresa_id).filter(Boolean)));
      let empresasMap: Record<string, { nome: string | null; slug: string | null }> = {};
      if (empresaIds.length > 0) {
        const { data: emps } = await supabase
          .from("orbit_empresas")
          .select("id, nome, slug")
          .in("id", empresaIds);
        for (const e of emps ?? []) empresasMap[e.id] = { nome: e.nome, slug: e.slug };
      }
      return rows.map((r) => ({ ...r, empresa: empresasMap[r.empresa_id] ?? null })) as unknown as ClientOnboarding[];
    },

  });
}

export function useCreateOnboarding() {
  const qc = useQueryClient();
  const { empresaId } = useTenant();
  return useMutation({
    mutationFn: async (input: {
      // New-tenant flow (preferred for paying clients)
      empresa_nome?: string;
      slug?: string;
      monthly_price_cents?: number;
      setup_fee_cents?: number;
      // Onboarding contact data
      cliente_nome: string;
      cliente_email: string;
      cliente_empresa?: string;
      notes?: string;
      // Optional: target an existing empresa instead of creating a new one
      empresa_id?: string;
    }) => {
      const payload: Record<string, unknown> = { ...input };
      // If neither new-tenant name nor explicit empresa_id was provided, fall back to current tenant
      if (!input.empresa_nome && !input.empresa_id) {
        if (!empresaId) throw new Error("empresa_id ausente");
        payload.empresa_id = empresaId;
      }
      const { data, error } = await supabase.functions.invoke("orbit-onboarding-create", { body: payload });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.error?.message || "Falha ao criar onboarding");
      return data.data as {
        id: string;
        public_token: string;
        public_link: string;
        empresa_id: string;
        empresa_nome: string;
        empresa_slug: string;
        email_sent: boolean;
      };
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
