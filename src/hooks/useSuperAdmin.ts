import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { handleApiResponse } from "@/lib/api-envelope";

export interface Empresa {
  id: string;
  nome: string;
  cnpj: string | null;
  email_contato: string | null;
  telefone: string | null;
  logo_url: string | null;
  plano: string | null;
  ativo: boolean | null;
  max_usuarios: number | null;
  data_expiracao: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface CreateEmpresaData {
  nome: string;
  cnpj?: string;
  email_contato?: string;
  telefone?: string;
  plano?: string;
  plano_saas?: string;
  max_usuarios?: number;
  data_expiracao?: string;
  admin_nome: string;
  admin_email: string;
  admin_senha: string;
}

export function useEmpresas() {
  return useQuery({
    queryKey: ['empresas'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('orbit_empresas')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data as Empresa[];
    },
  });
}

export function useEmpresa(id: string) {
  return useQuery({
    queryKey: ['empresa', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('orbit_empresas')
        .select('*')
        .eq('id', id)
        .single();

      if (error) throw error;
      return data as Empresa;
    },
    enabled: !!id,
  });
}

export function useEmpresaUsers(empresaId: string) {
  return useQuery({
    queryKey: ['empresa-users', empresaId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select(`
          id,
          nome,
          email,
          cargo,
          ativo,
          created_at,
          user_roles (role)
        `)
        .eq('empresa_id', empresaId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data;
    },
    enabled: !!empresaId,
  });
}

export function useAddEmpresaUser() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: {
      empresa_id: string;
      nome: string;
      email: string;
      senha: string;
      cargo?: string;
      role: string;
    }) => {
      const response = await supabase.functions.invoke('add-empresa-user', {
        body: data,
      });

      return handleApiResponse(response);
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['empresa-users', variables.empresa_id] });
      queryClient.invalidateQueries({ queryKey: ['empresas-stats'] });
    },
  });
}

export function useToggleUserAtivo() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ userId, ativo }: { userId: string; ativo: boolean }) => {
      const { data, error } = await supabase
        .from('profiles')
        .update({ ativo })
        .eq('id', userId)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['empresa-users'] });
    },
  });
}

export function useChangeUserRole() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: string }) => {
      // Delete existing roles then insert new one
      const { error: deleteError } = await supabase
        .from('user_roles')
        .delete()
        .eq('user_id', userId);

      if (deleteError) throw deleteError;

      const { data, error } = await supabase
        .from('user_roles')
        .insert({ user_id: userId, role: role as any });

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['empresa-users'] });
    },
  });
}

export function useUsersStats() {
  return useQuery({
    queryKey: ['users-stats'],
    queryFn: async () => {
      const { data: profiles, error } = await supabase
        .from('profiles')
        .select('id, ativo');

      if (error) throw error;

      const total = profiles?.length || 0;
      const ativos = profiles?.filter(p => p.ativo)?.length || 0;
      const inativos = total - ativos;

      return { total, ativos, inativos };
    },
  });
}

export function useCreateEmpresa() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: CreateEmpresaData) => {
      const response = await supabase.functions.invoke('create-empresa', {
        body: data,
      });

      return handleApiResponse(response);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['empresas'] });
    },
  });
}

export function useUpdateEmpresa() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...data }: Partial<Empresa> & { id: string }) => {
      const { data: result, error } = await supabase
        .from('orbit_empresas')
        .update(data)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return result;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['empresas'] });
      queryClient.invalidateQueries({ queryKey: ['empresa', data.id] });
    },
  });
}

export function useToggleEmpresaAtivo() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ativo }: { id: string; ativo: boolean }) => {
      const { data, error } = await supabase
        .from('orbit_empresas')
        .update({ ativo })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['empresas'] });
    },
  });
}

export function useEmpresasStats() {
  return useQuery({
    queryKey: ['empresas-stats'],
    queryFn: async () => {
      const { data: empresas, error } = await supabase
        .from('orbit_empresas')
        .select('id, ativo, plano');

      if (error) throw error;

      const total = empresas?.length || 0;
      const ativas = empresas?.filter(e => e.ativo)?.length || 0;
      const trial = empresas?.filter(e => e.plano === 'trial')?.length || 0;

      return { total, ativas, trial };
    },
  });
}
