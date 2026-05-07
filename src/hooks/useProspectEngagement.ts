import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface ProspectEngagement {
  prospect_id: string;
  total_emails: number;
  total_aberturas: number;
  total_cliques: number;
  ultima_abertura_em: string | null;
  ultimo_clique_em: string | null;
  bounced: boolean;
  complained: boolean;
  engajamento_score: number;
}

/**
 * Aggregated email engagement summary per prospect across ALL email campaigns.
 * @param empresaId  empresa scope
 * @param dias       0 or negative = todos os tempos; default 90
 */
export function useProspectEngagement(empresaId: string | null | undefined, dias = 90) {
  return useQuery({
    queryKey: ["prospect-engagement", empresaId, dias],
    queryFn: async (): Promise<Map<string, ProspectEngagement>> => {
      if (!empresaId) return new Map();
      const { data, error } = await supabase.rpc("get_prospect_engagement_summary", {
        p_empresa_id: empresaId,
        p_dias: dias,
      });
      if (error) throw error;
      const map = new Map<string, ProspectEngagement>();
      (data as ProspectEngagement[] | null)?.forEach(r => map.set(r.prospect_id, r));
      return map;
    },
    enabled: !!empresaId,
    staleTime: 60_000,
  });
}
