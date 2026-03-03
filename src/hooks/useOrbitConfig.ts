import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables, TablesUpdate } from "@/integrations/supabase/types";

type AIConfig = Tables<"orbit_ai_config">;
type AIConfigUpdate = TablesUpdate<"orbit_ai_config">;
type ResendConfig = Tables<"orbit_resend_config">;
type ResendConfigUpdate = TablesUpdate<"orbit_resend_config">;

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
      let query = supabase.from("orbit_zapi_config").select("*");
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

export function useUpdateZAPIConfig() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (updates: any & { empresa_id?: string | null }) => {
      const empresaId = updates.empresa_id;
      let existingQuery = supabase.from("orbit_zapi_config").select("id");
      if (empresaId) {
        existingQuery = existingQuery.eq("empresa_id", empresaId);
      }
      const { data: existing } = await existingQuery.maybeSingle();

      if (existing) {
        const { data, error } = await supabase
          .from("orbit_zapi_config")
          .update(updates)
          .eq("id", existing.id)
          .select()
          .single();
        if (error) throw error;
        return data;
      } else {
        const { data, error } = await supabase
          .from("orbit_zapi_config")
          .insert({ ...updates, empresa_id: empresaId })
          .select()
          .single();
        if (error) throw error;
        return data;
      }
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
export function useOrbitResendConfig() {
  return useQuery({
    queryKey: ["orbit_resend_config"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orbit_resend_config")
        .select("*")
        .maybeSingle();
      if (error) throw error;
      return data as ResendConfig & { api_key?: string; dominio_verificado?: string; email_teste?: string } | null;
    },
  });
}

export function useUpdateResendConfig() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (updates: ResendConfigUpdate & { api_key?: string; dominio_verificado?: string; email_teste?: string }) => {
      const { data: existing } = await supabase
        .from("orbit_resend_config")
        .select("id")
        .maybeSingle();

      if (existing) {
        const { data, error } = await supabase
          .from("orbit_resend_config")
          .update(updates as any)
          .eq("id", existing.id)
          .select()
          .single();
        if (error) throw error;
        return data;
      } else {
        const { data, error } = await supabase
          .from("orbit_resend_config")
          .insert(updates as any)
          .select()
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