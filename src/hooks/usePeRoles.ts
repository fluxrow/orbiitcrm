import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export function usePeRoles() {
  return useQuery({
    queryKey: ["pe-roles"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pe_roles" as any)
        .select("*")
        .order("code");
      if (error) throw error;
      return data as any[];
    },
  });
}
