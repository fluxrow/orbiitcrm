import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";

export type AppRole = 'super_admin' | 'admin' | 'vendedor' | 'visualizador';

export function useUserRoles() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['user-roles', user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      
      const { data, error } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id);

      if (error) throw error;
      return data?.map(r => r.role as AppRole) || [];
    },
    enabled: !!user?.id,
  });
}

export function useHasRole(role: AppRole) {
  const { data: roles, isLoading } = useUserRoles();
  return {
    hasRole: roles?.includes(role) || false,
    isLoading,
  };
}

export function useIsSuperAdmin() {
  return useHasRole('super_admin');
}

export function useIsAdmin() {
  const { data: roles, isLoading } = useUserRoles();
  return {
    isAdmin: roles?.includes('admin') || roles?.includes('super_admin') || false,
    isLoading,
  };
}

export function useUserEmpresa() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['user-empresa', user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('empresa_id')
        .eq('id', user.id)
        .single();

      if (profileError || !profile?.empresa_id) return null;

      const { data: empresa, error: empresaError } = await supabase
        .from('orbit_empresas')
        .select('*')
        .eq('id', profile.empresa_id)
        .single();

      if (empresaError) throw empresaError;
      return empresa;
    },
    enabled: !!user?.id,
  });
}
