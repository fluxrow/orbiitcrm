import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface SaasPlan {
  id: string;
  code: string;
  name: string;
  features: Record<string, boolean>;
  limits: Record<string, number>;
  created_at: string;
  updated_at: string;
  stripe_product_id?: string | null;
  stripe_price_id_monthly?: string | null;
  stripe_price_id_yearly?: string | null;
  stripe_active?: boolean;
}

export interface SaasEmpresa {
  empresa_id: string;
  plan_id: string;
  status: string;
  responsible_name: string | null;
  responsible_email: string | null;
  invited_at: string | null;
  activated_at: string | null;
  trial_ends_at: string | null;
  billing_status: string | null;
  created_by_user_id: string;
  created_at: string;
  updated_at: string;
  saas_plans?: SaasPlan;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  stripe_status: string | null;
  current_period_start: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  trial_end: string | null;
  last_invoice_status: string | null;
  last_payment_error: string | null;
  empresa_nome?: string | null;
  empresa_slug?: string | null;
  member_count?: number;
}


export interface SaasUsageMonthly {
  id: string;
  empresa_id: string;
  period: string;
  email_sent: number;
  whatsapp_sent: number;
  ig_sent: number;
  fb_sent: number;
  lead_search_calls: number;
  created_at: string;
  updated_at: string;
}

export function useSaasPlans() {
  return useQuery({
    queryKey: ["saas-plans"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("saas_plans" as any)
        .select("*")
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data as unknown as SaasPlan[];
    },
  });
}

export function useSaasEmpresa(empresaId: string | undefined) {
  return useQuery({
    queryKey: ["saas-empresa", empresaId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("saas_empresa" as any)
        .select("*, saas_plans(*)")
        .eq("empresa_id", empresaId!)
        .maybeSingle();
      if (error) throw error;
      return data as unknown as SaasEmpresa | null;
    },
    enabled: !!empresaId,
  });
}

export function useSaasEmpresas() {
  return useQuery({
    queryKey: ["saas-empresas"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("saas_empresa" as any)
        .select("*, saas_plans(*), orbit_empresas:empresa_id(nome, slug)");
      if (error) throw error;

      // Fetch member counts in a single query
      const empresaIds = ((data as any[]) ?? []).map((s) => s.empresa_id);
      let memberCounts: Record<string, number> = {};
      if (empresaIds.length > 0) {
        const { data: memberships } = await supabase
          .from("user_empresa_memberships" as any)
          .select("empresa_id")
          .in("empresa_id", empresaIds);
        for (const m of (memberships as any[]) ?? []) {
          memberCounts[m.empresa_id] = (memberCounts[m.empresa_id] ?? 0) + 1;
        }
      }

      return ((data as any[]) ?? []).map((s) => ({
        ...s,
        empresa_nome: s.orbit_empresas?.nome ?? null,
        empresa_slug: s.orbit_empresas?.slug ?? null,
        member_count: memberCounts[s.empresa_id] ?? 0,
      })) as unknown as SaasEmpresa[];
    },
  });
}

export function useSaasUsage(empresaId: string | undefined, period: string) {
  return useQuery({
    queryKey: ["saas-usage", empresaId, period],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("saas_usage_monthly" as any)
        .select("*")
        .eq("empresa_id", empresaId!)
        .eq("period", period)
        .maybeSingle();
      if (error) throw error;
      return data as unknown as SaasUsageMonthly | null;
    },
    enabled: !!empresaId && !!period,
  });
}

export function useCreateSaasPlan() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (plan: Omit<SaasPlan, "id" | "created_at" | "updated_at">) => {
      const { data, error } = await supabase
        .from("saas_plans" as any)
        .insert(plan)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["saas-plans"] });
    },
  });
}

export function useUpdateSaasPlan() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: { id: string } & Partial<Omit<SaasPlan, "id" | "created_at" | "updated_at">>) => {
      const { data, error } = await supabase
        .from("saas_plans" as any)
        .update(updates)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["saas-plans"] });
    },
  });
}

export function useUpdateSaasEmpresa() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      empresaId,
      ...updates
    }: { empresaId: string } & Partial<Omit<SaasEmpresa, "empresa_id" | "created_at" | "updated_at" | "saas_plans">>) => {
      const { data, error } = await supabase
        .from("saas_empresa" as any)
        .update(updates)
        .eq("empresa_id", empresaId)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ["saas-empresa", vars.empresaId] });
      queryClient.invalidateQueries({ queryKey: ["saas-empresas"] });
    },
  });
}
