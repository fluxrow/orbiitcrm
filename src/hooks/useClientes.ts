import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { usePeAuth } from "./usePeAuth";
import { toast } from "sonner";

export interface ClienteFilters {
  segmento_id?: string;
  cidade?: string;
  uf?: string;
  status_geral?: string;
  search?: string;
}

function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9 ]/g, "")
    .trim();
}

export function useClientes(filters?: ClienteFilters) {
  const { orgId, isSuperAdmin } = usePeAuth();

  return useQuery({
    queryKey: ["clientes", orgId, filters],
    queryFn: async () => {
      let query = supabase
        .from("clientes" as any)
        .select("*, segmentos(macro, micro)")
        .order("razao_social");

      if (!isSuperAdmin && orgId) {
        query = query.eq("organization_id", orgId);
      }
      if (filters?.segmento_id) query = query.eq("segmento_id", filters.segmento_id);
      if (filters?.uf) query = query.eq("uf", filters.uf);
      if (filters?.cidade) query = query.ilike("cidade", `%${filters.cidade}%`);
      if (filters?.status_geral) query = query.eq("status_geral", filters.status_geral);
      if (filters?.search) {
        query = query.or(`razao_social.ilike.%${filters.search}%,cnpj.ilike.%${filters.search}%,dominio_principal.ilike.%${filters.search}%`);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as any[];
    },
  });
}

export function useCliente(id: string | undefined) {
  return useQuery({
    queryKey: ["cliente", id],
    queryFn: async () => {
      if (!id) return null;
      const { data, error } = await supabase
        .from("clientes" as any)
        .select("*, segmentos(macro, micro)")
        .eq("id", id)
        .single();
      if (error) throw error;
      return data as any;
    },
    enabled: !!id,
  });
}

export function useCreateCliente() {
  const qc = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (c: {
      organization_id: string;
      razao_social: string;
      nome_fantasia?: string;
      cnpj?: string;
      site?: string;
      segmento_id?: string;
      porte?: string;
      cidade?: string;
      uf?: string;
      observacoes?: string;
    }) => {
      const razao_social_normalizada = normalizeText(c.razao_social);
      const dominio_principal = c.site ? c.site.replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0] : null;

      const { data, error } = await supabase
        .from("clientes" as any)
        .insert({ ...c, razao_social_normalizada, dominio_principal })
        .select()
        .single();
      if (error) throw error;

      await supabase.from("pe_audit_log" as any).insert({
        organization_id: c.organization_id,
        actor_user_id: user?.id,
        action: "CLIENTE_CREATED",
        entity_type: "cliente",
        entity_id: (data as any).id,
      });
      return data;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["clientes"] }); toast.success("Cliente criado"); },
    onError: (e: any) => toast.error(e.message),
  });
}

export function useUpdateCliente() {
  const qc = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({ id, ...updates }: { id: string; [key: string]: any }) => {
      if (updates.razao_social) {
        updates.razao_social_normalizada = normalizeText(updates.razao_social);
      }
      if (updates.site !== undefined) {
        updates.dominio_principal = updates.site ? updates.site.replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0] : null;
      }
      const { data: before } = await supabase.from("clientes" as any).select("*").eq("id", id).single();
      const { data, error } = await supabase.from("clientes" as any).update(updates).eq("id", id).select().single();
      if (error) throw error;

      if (before) {
        await supabase.from("pe_audit_log" as any).insert({
          organization_id: (before as any).organization_id,
          actor_user_id: user?.id,
          action: "CLIENTE_UPDATED",
          entity_type: "cliente",
          entity_id: id,
          metadata: { before, after: updates },
        });
      }
      return data;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["clientes"] }); qc.invalidateQueries({ queryKey: ["cliente"] }); toast.success("Cliente atualizado"); },
    onError: (e: any) => toast.error(e.message),
  });
}

export { normalizeText };
