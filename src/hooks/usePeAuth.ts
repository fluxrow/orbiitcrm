import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";

export interface PeUser {
  id: string;
  organization_id: string | null;
  role_id: string | null;
  full_name: string;
  email: string;
  phone: string | null;
  is_active: boolean;
  is_super_admin: boolean;
  created_at: string;
  updated_at: string;
}

export function usePeAuth() {
  const { user } = useAuth();

  const query = useQuery({
    queryKey: ["pe-auth", user?.id],
    queryFn: async () => {
      if (!user?.id) return null;

      const { data, error } = await supabase
        .from("pe_users" as any)
        .select("*, pe_roles(code, name)")
        .eq("id", user.id)
        .single();

      if (error) throw error;
      return data as any;
    },
    enabled: !!user?.id,
  });

  const peUser = query.data;
  const isSuperAdmin = peUser?.is_super_admin ?? false;
  const orgId = peUser?.organization_id ?? null;
  const roleCode = (peUser?.pe_roles as any)?.code ?? null;

  return {
    peUser,
    isSuperAdmin,
    orgId,
    roleCode,
    isLoading: query.isLoading,
    error: query.error,
  };
}
