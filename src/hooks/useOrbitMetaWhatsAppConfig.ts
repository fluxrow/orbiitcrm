import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTenant } from "@/contexts/TenantContext";
import { supabase } from "@/integrations/supabase/client";

export interface OrbitMetaWhatsAppConfigView {
  id: string;
  empresa_id: string;
  waba_id: string | null;
  phone_number_id: string | null;
  graph_api_version: string;
  webhook_verify_token: string;
  has_access_token: boolean;
  has_app_secret: boolean;
  ativo: boolean;
  envio_real_liberado: boolean;
  canary_mode_enabled: boolean;
  canary_phone_numbers: string[];
  allow_proactive_messages: boolean;
  activated_at: string | null;
}

export interface OrbitMetaWhatsAppConfigInput {
  waba_id?: string | null;
  phone_number_id?: string | null;
  access_token?: string | null;
  app_secret?: string | null;
  graph_api_version?: string;
  ativo?: boolean;
  envio_real_liberado?: boolean;
  canary_mode_enabled?: boolean;
  canary_phone_numbers?: string[];
  allow_proactive_messages?: boolean;
}

export function useOrbitMetaWhatsAppConfig(empresaId?: string | null) {
  return useQuery({
    queryKey: ["orbit_meta_whatsapp_config", empresaId],
    enabled: !!empresaId,
    queryFn: async () => {
      const { data, error } = await (supabase.rpc as any)(
        "get_orbit_meta_whatsapp_config_public",
        { p_empresa_id: empresaId },
      );
      if (error) throw error;
      return data as OrbitMetaWhatsAppConfigView | null;
    },
    staleTime: 30_000,
  });
}

export function useUpdateMetaWhatsAppConfig() {
  const queryClient = useQueryClient();
  const { empresaId } = useTenant();
  return useMutation({
    mutationFn: async (input: OrbitMetaWhatsAppConfigInput) => {
      if (!empresaId) throw new Error("TENANT_CONTEXT_MISSING");
      const { data, error } = await (supabase.rpc as any)(
        "upsert_orbit_meta_whatsapp_config_secure",
        {
          p_empresa_id: empresaId,
          p_waba_id: input.waba_id ?? null,
          p_phone_number_id: input.phone_number_id ?? null,
          p_access_token: input.access_token?.trim() || null,
          p_app_secret: input.app_secret?.trim() || null,
          p_graph_api_version: input.graph_api_version ?? "v25.0",
          p_ativo: input.ativo ?? false,
          p_envio_real_liberado: input.envio_real_liberado ?? false,
          p_canary_mode_enabled: input.canary_mode_enabled ?? true,
          p_canary_phone_numbers: input.canary_phone_numbers ?? [],
          p_allow_proactive_messages: input.allow_proactive_messages ?? false,
        },
      );
      if (error) throw error;
      return data as OrbitMetaWhatsAppConfigView;
    },
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["orbit_meta_whatsapp_config"] }),
  });
}

export async function testMetaWhatsAppConnection(empresaId: string) {
  const { data, error } = await supabase.functions.invoke(
    "orbit-meta-whatsapp-health",
    { body: { empresa_id: empresaId } },
  );
  if (error) throw error;
  return data as {
    ok: boolean;
    error?: string;
    quality_rating?: string | null;
    verified_name?: string | null;
    name_status?: string | null;
    code_verification_status?: string | null;
  };
}
