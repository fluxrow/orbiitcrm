import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

interface SendGroup {
  id: string;
  empresa_id: string;
  nome: string;
  descricao: string | null;
  prospect_ids: string[];
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export function useOrbitSendGroups() {
  return useQuery({
    queryKey: ["orbit_send_groups"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orbit_send_groups")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as unknown as SendGroup[];
    },
  });
}

export function useCreateSendGroup() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (group: { empresa_id: string; nome: string; descricao?: string; prospect_ids: string[]; created_by?: string }) => {
      const { data, error } = await supabase
        .from("orbit_send_groups" as any)
        .insert(group)
        .select()
        .single();
      if (error) throw error;
      return data as unknown as SendGroup;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["orbit_send_groups"] });
    },
  });
}

export function useDeleteSendGroup() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("orbit_send_groups" as any)
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["orbit_send_groups"] });
    },
  });
}
