import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export function useProspectEvents(prospectId: string | undefined) {
  return useQuery({
    queryKey: ["prospect_events", prospectId],
    queryFn: async () => {
      if (!prospectId) return [];
      const { data, error } = await supabase
        .from("prospect_events" as any)
        .select("*")
        .eq("prospect_id", prospectId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as any[];
    },
    enabled: !!prospectId,
  });
}

export function useCreateProspectEvent() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (event: {
      empresa_id: string;
      prospect_id: string;
      actor_user_id?: string;
      event_type: string;
      titulo?: string;
      descricao?: string;
      metadata?: Record<string, any>;
    }) => {
      const { data, error } = await supabase
        .from("prospect_events" as any)
        .insert(event)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["prospect_events", variables.prospect_id] });
    },
  });
}
