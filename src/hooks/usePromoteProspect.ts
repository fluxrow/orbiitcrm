import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

interface PromoteParams {
  empresa_id: string;
  prospect_id: string;
  create_opportunity?: boolean;
  owner_user_id?: string | null;
}

interface PromoteResult {
  organization_id: string;
  cliente_id: string;
  contato_id: string;
  oportunidade_id: string | null;
  link_id: string;
  match_type: string;
  match_confidence: number;
}

export function usePromoteProspect() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: PromoteParams): Promise<PromoteResult> => {
      const { data, error } = await supabase.rpc("pe_promote_prospect" as any, {
        p_empresa_id: params.empresa_id,
        p_prospect_id: params.prospect_id,
        p_create_opportunity: params.create_opportunity ?? true,
        p_owner_user_id: params.owner_user_id ?? null,
      });
      if (error) throw error;
      return data as unknown as PromoteResult;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["orbit_prospects"] });
      queryClient.invalidateQueries({ queryKey: ["orbit_pe_links"] });
      queryClient.invalidateQueries({ queryKey: ["clientes"] });
      queryClient.invalidateQueries({ queryKey: ["oportunidades"] });
    },
  });
}

export function useOrbitPeLinks() {
  return useQuery({
    queryKey: ["orbit_pe_links"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orbit_pe_links" as any)
        .select("prospect_id, cliente_id, match_type, match_confidence")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as any[];
    },
  });
}
