import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { usePeAuth } from "./usePeAuth";
import { toast } from "sonner";

export interface ContatoFilters {
  cliente_id?: string;
  decisor?: boolean;
  search?: string;
}

export function useContatos(filters?: ContatoFilters) {
  const { orgId, isSuperAdmin } = usePeAuth();

  return useQuery({
    queryKey: ["contatos", orgId, filters],
    queryFn: async () => {
      let query = supabase
        .from("contatos" as any)
        .select("*, clientes(razao_social)")
        .order("nome");

      if (!isSuperAdmin && orgId) query = query.eq("organization_id", orgId);
      if (filters?.cliente_id) query = query.eq("cliente_id", filters.cliente_id);
      if (filters?.decisor !== undefined) query = query.eq("decisor", filters.decisor);
      if (filters?.search) {
        query = query.or(`nome.ilike.%${filters.search}%,email.ilike.%${filters.search}%,telefone.ilike.%${filters.search}%,whatsapp.ilike.%${filters.search}%`);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as any[];
    },
  });
}

export function useCreateContato() {
  const qc = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (c: {
      organization_id: string;
      cliente_id: string;
      nome: string;
      cargo?: string;
      area?: string;
      email?: string;
      telefone?: string;
      whatsapp?: string;
      decisor?: boolean;
      nivel_influencia?: number;
    }) => {
      const email_normalizado = c.email ? c.email.toLowerCase().trim() : null;
      const { data, error } = await supabase
        .from("contatos" as any)
        .insert({ ...c, email_normalizado })
        .select()
        .single();
      if (error) throw error;

      await supabase.from("pe_audit_log" as any).insert({
        organization_id: c.organization_id,
        actor_user_id: user?.id,
        action: "CONTATO_CREATED",
        entity_type: "contato",
        entity_id: (data as any).id,
      });
      return data;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["contatos"] }); toast.success("Contato criado"); },
    onError: (e: any) => toast.error(e.message),
  });
}

export function useUpdateContato() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...updates }: { id: string; [key: string]: any }) => {
      if (updates.email !== undefined) {
        updates.email_normalizado = updates.email ? updates.email.toLowerCase().trim() : null;
      }
      const { data, error } = await supabase.from("contatos" as any).update(updates).eq("id", id).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["contatos"] }); toast.success("Contato atualizado"); },
    onError: (e: any) => toast.error(e.message),
  });
}
