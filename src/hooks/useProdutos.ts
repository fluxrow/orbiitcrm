import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { usePeAuth } from "./usePeAuth";
import { toast } from "sonner";

const DEFAULT_PRODUCTS = [
  { codigo: "AEREO", nome: "Aéreo", categoria: "TRANSPORTE" },
  { codigo: "RODOVIARIO", nome: "Rodoviário", categoria: "TRANSPORTE" },
  { codigo: "LOCACAO_VEICULO", nome: "Locação de Veículo", categoria: "TRANSPORTE" },
  { codigo: "TRANSFER", nome: "Transfer", categoria: "TRANSPORTE" },
  { codigo: "HOSPEDAGEM", nome: "Hospedagem", categoria: "HOSPEDAGEM" },
  { codigo: "SEGURO", nome: "Seguro Viagem", categoria: "PROTECAO" },
  { codigo: "EVENTOS", nome: "Eventos", categoria: "EVENTOS" },
];

export function useProdutos(filters?: { categoria?: string }) {
  const { orgId, isSuperAdmin } = usePeAuth();

  return useQuery({
    queryKey: ["produtos", orgId, filters],
    queryFn: async () => {
      let query = supabase
        .from("produtos")
        .select("*")
        .order("categoria")
        .order("nome");

      if (!isSuperAdmin && orgId) {
        query = query.eq("organization_id", orgId);
      }
      if (filters?.categoria) query = query.eq("categoria", filters.categoria);

      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
  });
}

export function useCreateProduto() {
  const qc = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (p: { organization_id: string; nome: string; codigo: string; categoria: string }) => {
      const { data, error } = await supabase.from("produtos").insert(p).select().single();
      if (error) throw error;

      await supabase.from("pe_audit_log" as any).insert({
        organization_id: p.organization_id,
        actor_user_id: user?.id,
        action: "PRODUTO_CREATED",
        entity_type: "produto",
        entity_id: data.id,
      });
      return data;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["produtos"] }); toast.success("Produto criado"); },
    onError: (e: any) => toast.error(e.message),
  });
}

export function useUpdateProduto() {
  const qc = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({ id, ...updates }: { id: string; nome?: string; codigo?: string; categoria?: string; is_active?: boolean }) => {
      const { data: before } = await supabase.from("produtos").select("*").eq("id", id).single();
      const { data, error } = await supabase.from("produtos").update(updates).eq("id", id).select().single();
      if (error) throw error;

      if (before) {
        await supabase.from("pe_audit_log" as any).insert({
          organization_id: (before as any).organization_id,
          actor_user_id: user?.id,
          action: "PRODUTO_UPDATED",
          entity_type: "produto",
          entity_id: id,
          metadata: { before, after: updates },
        });
      }
      return data;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["produtos"] }); toast.success("Produto atualizado"); },
    onError: (e: any) => toast.error(e.message),
  });
}

export function useDeleteProduto() {
  const qc = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (id: string) => {
      // Fetch before state for audit
      const { data: before } = await supabase.from("produtos").select("*").eq("id", id).single();
      // Soft-delete instead of physical delete
      const { error } = await supabase.from("produtos").update({ is_active: false }).eq("id", id);
      if (error) throw error;

      if (before) {
        await supabase.from("pe_audit_log" as any).insert({
          organization_id: (before as any).organization_id,
          actor_user_id: user?.id,
          action: "PRODUTO_DEACTIVATED",
          entity_type: "produto",
          entity_id: id,
          metadata: { before },
        });
      }
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["produtos"] }); toast.success("Produto desativado"); },
    onError: (e: any) => toast.error(e.message),
  });
}

export function useCreateDefaultProducts() {
  const qc = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (organizationId: string) => {
      const rows = DEFAULT_PRODUCTS.map((p) => ({ ...p, organization_id: organizationId }));
      const { data, error } = await supabase.from("produtos").insert(rows).select();
      if (error) throw error;

      await supabase.from("pe_audit_log" as any).insert({
        organization_id: organizationId,
        actor_user_id: user?.id,
        action: "DEFAULT_PRODUCTS_CREATED",
        entity_type: "produto",
        metadata: { count: rows.length },
      });
      return data;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["produtos"] }); toast.success("Produtos padrão criados"); },
    onError: (e: any) => toast.error(e.message),
  });
}
