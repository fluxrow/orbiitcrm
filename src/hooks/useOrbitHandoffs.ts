import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export function useOrbitHandoff(conversaId: string | undefined) {
  return useQuery({
    queryKey: ["orbit_handoff", conversaId],
    queryFn: async () => {
      if (!conversaId) return null;
      const { data, error } = await supabase
        .from("orbit_handoffs" as any)
        .select("*, vendedor:profiles!orbit_handoffs_vendedor_id_fkey(id, nome)")
        .eq("conversa_id", conversaId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data as any;
    },
    enabled: !!conversaId,
  });
}
