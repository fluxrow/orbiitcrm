import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables, TablesUpdate } from "@/integrations/supabase/types";

type AIConfig = Tables<"orbit_ai_config">;
type AIConfigUpdate = TablesUpdate<"orbit_ai_config">;
type ResendConfig = Tables<"orbit_resend_config">;
type ResendConfigUpdate = TablesUpdate<"orbit_resend_config">;

export interface OrbitZAPIConfigView {
  id: string;
  empresa_id: string | null;
  nome_instancia: string | null;
  instance_id: string | null;
  numero_origem: string | null;
  webhook_url: string | null;
  notificar_enviadas_por_mim: boolean | null;
  ativo: boolean | null;
  has_token: boolean;
  has_client_token: boolean;
  created_at?: string | null;
  updated_at?: string | null;
}

interface OrbitZAPIConfigInput {
  id?: string | null;
  empresa_id?: string | null;
  nome_instancia?: string | null;
  instance_id?: string | null;
  token?: string | null;
  client_token?: string | null;
  numero_origem?: string | null;
  webhook_url?: string | null;
  notificar_enviadas_por_mim?: boolean | null;
  ativo?: boolean | null;
}

export function useOrbitAIConfig(empresaId?: string | null) {
  return useQuery({
    queryKey: ["orbit_ai_config", empresaId],
    queryFn: async () => {
      let query = supabase.from("orbit_ai_config").select("*");
      if (empresaId) {
        query = query.eq("empresa_id", empresaId);
      }
      const { data, error } = await query.maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!empresaId,
  });
}

export function useUpdateAIConfig() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (updates: AIConfigUpdate & { empresa_id?: string | null }) => {
      const empresaId = updates.empresa_id;
      // First check if config exists for this empresa
      let existingQuery = supabase.from("orbit_ai_config").select("id");
      if (empresaId) {
        existingQuery = existingQuery.eq("empresa_id", empresaId);
      }
      const { data: existing } = await existingQuery.maybeSingle();

      if (existing) {
        const { data, error } = await supabase
          .from("orbit_ai_config")
          .update(updates)
          .eq("id", existing.id)
          .select()
          .single();
        if (error) throw error;
        return data;
      } else {
        const { data, error } = await supabase
          .from("orbit_ai_config")
          .insert({ ...updates, empresa_id: empresaId } as any)
          .select()
          .single();
        if (error) throw error;
        return data;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["orbit_ai_config"] });
    },
  });
}

export function useOrbitZAPIConfig(empresaId?: string | null) {
  return useQuery({
    queryKey: ["orbit_zapi_config", empresaId],
    queryFn: async () => {
      const { data, error } = await (supabase.rpc as any)("get_orbit_zapi_config_public", {
        p_empresa_id: empresaId,
      });
      if (error) throw error;
      return data as OrbitZAPIConfigView | null;
    },
    enabled: !!empresaId,
    staleTime: 60000,
  });
}

export function useUpdateZAPIConfig() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (updates: OrbitZAPIConfigInput) => {
      const { data, error } = await (supabase.rpc as any)("upsert_orbit_zapi_config_secure", {
        p_empresa_id: updates.empresa_id,
        p_nome_instancia: updates.nome_instancia ?? null,
        p_instance_id: updates.instance_id ?? null,
        p_token: updates.token?.trim() ? updates.token.trim() : null,
        p_client_token: updates.client_token?.trim() ? updates.client_token.trim() : null,
        p_numero_origem: updates.numero_origem ?? null,
        p_webhook_url: updates.webhook_url ?? null,
        p_notificar_enviadas_por_mim: updates.notificar_enviadas_por_mim ?? false,
        p_ativo: updates.ativo ?? false,
      });
      if (error) throw error;
      return data as OrbitZAPIConfigView | null;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["orbit_zapi_config"] });
    },
  });
}

export function useOrbitDistribuicao() {
  return useQuery({
    queryKey: ["orbit_distribuicao_config"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orbit_distribuicao_config")
        .select(`
          *,
          vendedor:profiles!orbit_distribuicao_config_vendedor_id_fkey(id, nome, email)
        `)
        .order("ordem_fila", { ascending: true });
      if (error) throw error;
      return data;
    },
  });
}

export function useAddVendedorToDistribuicao() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ vendedor_id, ordem_fila }: { vendedor_id: string; ordem_fila?: number }) => {
      const { data, error } = await supabase
        .from("orbit_distribuicao_config")
        .insert({ vendedor_id, ordem_fila: ordem_fila || 0 })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["orbit_distribuicao_config"] });
    },
  });
}

export function useToggleVendedorDistribuicao() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ativo }: { id: string; ativo: boolean }) => {
      const { data, error } = await supabase
        .from("orbit_distribuicao_config")
        .update({ ativo })
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["orbit_distribuicao_config"] });
    },
  });
}

export function useRemoveVendedorFromDistribuicao() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("orbit_distribuicao_config")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["orbit_distribuicao_config"] });
    },
  });
}

// Resend Config Hooks
// NOTE: api_key column is REVOKE'd from authenticated for security; we read everything
// except api_key and derive a `has_api_key` flag via a SECURITY DEFINER RPC.
const RESEND_SAFE_COLS =
  "id, empresa_id, from_email, from_name, ativo, created_at, updated_at, dominio_verificado, email_teste, reply_to_email";

export function useOrbitResendConfig(empresaId?: string | null) {
  return useQuery({
    queryKey: ["orbit_resend_config", empresaId],
    queryFn: async () => {
      let q = supabase.from("orbit_resend_config").select(RESEND_SAFE_COLS);
      if (empresaId) q = q.eq("empresa_id", empresaId);
      const { data, error } = await q.maybeSingle();
      if (error) throw error;
      if (!data) return null;
      const { data: hasKey } = await supabase.rpc("orbit_resend_has_api_key", {
        p_empresa_id: empresaId ?? null,
      });
      return { ...(data as any), has_api_key: !!hasKey } as ResendConfig & {
        dominio_verificado?: string;
        email_teste?: string;
        has_api_key?: boolean;
      } | null;
    },
    enabled: !!empresaId,
  });
}

export function useUpdateResendConfig() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (updates: ResendConfigUpdate & { api_key?: string; dominio_verificado?: string; email_teste?: string; empresa_id?: string | null }) => {
      const empresaId = updates.empresa_id;
      let existingQ = supabase.from("orbit_resend_config").select("id");
      if (empresaId) existingQ = existingQ.eq("empresa_id", empresaId);
      const { data: existing } = await existingQ.maybeSingle();

      if (existing) {
        const { data, error } = await supabase
          .from("orbit_resend_config")
          .update(updates as any)
          .eq("id", existing.id)
          .select(RESEND_SAFE_COLS)
          .single();
        if (error) throw error;
        return data;
      } else {
        const { data, error } = await supabase
          .from("orbit_resend_config")
          .insert({ ...updates, empresa_id: empresaId } as any)
          .select(RESEND_SAFE_COLS)
          .single();
        if (error) throw error;
        return data;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["orbit_resend_config"] });
    },
  });
}

// WhatsApp Sending Config Hooks
export function useWhatsAppSendingConfig(empresaId?: string | null) {
  return useQuery({
    queryKey: ["orbit_whatsapp_sending_config", empresaId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orbit_whatsapp_sending_config")
        .select("*")
        .eq("empresa_id", empresaId!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!empresaId,
  });
}

export function useUpdateWhatsAppSendingConfig() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (updates: any & { empresa_id: string }) => {
      const empresaId = updates.empresa_id;
      const { data: existing } = await supabase
        .from("orbit_whatsapp_sending_config")
        .select("id")
        .eq("empresa_id", empresaId)
        .maybeSingle();

      if (existing) {
        const { data, error } = await supabase
          .from("orbit_whatsapp_sending_config")
          .update(updates)
          .eq("id", existing.id)
          .select()
          .single();
        if (error) throw error;
        return data;
      } else {
        const { data, error } = await supabase
          .from("orbit_whatsapp_sending_config")
          .insert(updates)
          .select()
          .single();
        if (error) throw error;
        return data;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["orbit_whatsapp_sending_config"] });
    },
  });
}

export function useWhatsAppDailyUsage(empresaId?: string | null) {
  return useQuery({
    queryKey: ["orbit_whatsapp_daily_usage", empresaId],
    queryFn: async () => {
      const today = new Date().toISOString().split("T")[0];
      const { data, error } = await supabase
        .from("orbit_whatsapp_daily_usage")
        .select("*")
        .eq("empresa_id", empresaId!)
        .eq("usage_date", today)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!empresaId,
  });
}

// Test Resend Connection Hook
export function useTestResendConnection() {
  return useMutation({
    mutationFn: async ({ email, empresa_id }: { email: string; empresa_id?: string }) => {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/orbit-send-email`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
          body: JSON.stringify({
            to: email,
            subject: "Teste de Conexão - Orbit CRM",
            html: `
              <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <h1 style="color: #333;">Conexão Testada com Sucesso! ✅</h1>
                <p style="color: #666;">Este é um email de teste do Orbit CRM.</p>
                <p style="color: #666;">Se você recebeu este email, sua configuração do Resend está funcionando corretamente.</p>
                <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;" />
                <p style="color: #999; font-size: 12px;">Enviado automaticamente pelo Orbit CRM</p>
              </div>
            `,
            empresa_id,
          }),
        }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Erro ao testar conexão");
      }

      return response.json();
    },
  });
}
