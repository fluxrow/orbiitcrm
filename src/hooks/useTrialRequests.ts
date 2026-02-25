import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface TrialRequest {
  id: string;
  nome: string;
  empresa: string;
  email: string;
  telefone: string | null;
  plan_code: string;
  status: string;
  created_at: string;
}

export function useTrialRequests() {
  return useQuery({
    queryKey: ["trial-requests"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("trial_requests")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as TrialRequest[];
    },
  });
}
