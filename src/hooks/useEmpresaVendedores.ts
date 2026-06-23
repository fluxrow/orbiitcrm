import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/contexts/TenantContext";

/**
 * Lists users from the same empresa who are eligible as "vendedores" (sales reps).
 * Uses TenantContext to ensure we always query the active tenant.
 */
export function useEmpresaVendedores() {
  const { empresaId } = useTenant();

  return useQuery({
    queryKey: ["empresa-vendedores", empresaId],
    queryFn: async () => {
      if (!empresaId) return [];

      const { data, error } = await supabase
        .from("profiles")
        .select("id, nome, email, telefone, cargo, avatar_url")
        .eq("empresa_id", empresaId)
        .eq("ativo", true)
        .order("nome");

      if (error) throw error;
      return data || [];
    },
    enabled: !!empresaId,
  });
}
