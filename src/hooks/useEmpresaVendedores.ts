import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Lists users from the same empresa who are eligible as "vendedores" (sales reps).
 * ORG_ADMIN, ORG_MANAGER, ORG_SALES, ORG_SDR are all eligible.
 */
export function useEmpresaVendedores() {
  return useQuery({
    queryKey: ["empresa-vendedores"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return [];

      // Get current user's empresa_id from profiles
      const { data: profile } = await supabase
        .from("profiles")
        .select("empresa_id")
        .eq("id", user.id)
        .single();

      if (!profile?.empresa_id) return [];

      // Get all active profiles from same empresa
      const { data, error } = await supabase
        .from("profiles")
        .select("id, nome, email, telefone, cargo, avatar_url")
        .eq("empresa_id", profile.empresa_id)
        .eq("ativo", true)
        .order("nome");

      if (error) throw error;
      return data || [];
    },
  });
}
