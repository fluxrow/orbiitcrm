import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { toast } from "sonner";

export function useOportunidadeItens(oportunidadeId: string | undefined) {
  return useQuery({
    queryKey: ["oportunidade-itens", oportunidadeId],
    queryFn: async () => {
      if (!oportunidadeId) return [];
      const { data, error } = await supabase
        .from("oportunidade_itens")
        .select("*, produtos(nome, codigo, categoria)")
        .eq("oportunidade_id", oportunidadeId)
        .order("created_at");
      if (error) throw error;
      return data;
    },
    enabled: !!oportunidadeId,
  });
}

async function recalcOportunidadeTotal(oportunidadeId: string) {
  const { data: itens } = await supabase
    .from("oportunidade_itens")
    .select("valor_total")
    .eq("oportunidade_id", oportunidadeId);

  const total = (itens || []).reduce((sum, i) => sum + (Number(i.valor_total) || 0), 0);
  await supabase.from("oportunidades").update({ valor_total_estimado: total }).eq("id", oportunidadeId);
}

export function useCreateOportunidadeItem() {
  const qc = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (item: {
      organization_id: string;
      oportunidade_id: string;
      produto_id: string;
      descricao?: string;
      quantidade: number;
      valor_unitario?: number;
      fornecedor?: string;
    }) => {
      const valor_total = item.valor_unitario ? item.quantidade * item.valor_unitario : null;

      const { data, error } = await supabase
        .from("oportunidade_itens")
        .insert({ ...item, valor_total })
        .select()
        .single();
      if (error) throw error;

      await recalcOportunidadeTotal(item.oportunidade_id);

      await supabase.from("pe_audit_log" as any).insert({
        organization_id: item.organization_id,
        actor_user_id: user?.id,
        action: "ITEM_CREATED",
        entity_type: "oportunidade_item",
        entity_id: data.id,
        metadata: { oportunidade_id: item.oportunidade_id },
      });
      return data;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["oportunidade-itens", vars.oportunidade_id] });
      qc.invalidateQueries({ queryKey: ["oportunidade"] });
      qc.invalidateQueries({ queryKey: ["oportunidades"] });
      toast.success("Item adicionado");
    },
    onError: (e: any) => toast.error(e.message),
  });
}

export function useUpdateOportunidadeItem() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, oportunidade_id, ...updates }: {
      id: string;
      oportunidade_id: string;
      quantidade?: number;
      valor_unitario?: number;
      descricao?: string;
      fornecedor?: string;
      status?: string;
    }) => {
      const patch: any = { ...updates };
      if (updates.quantidade !== undefined && updates.valor_unitario !== undefined) {
        patch.valor_total = updates.quantidade * updates.valor_unitario;
      } else if (updates.quantidade !== undefined || updates.valor_unitario !== undefined) {
        const { data: current } = await supabase.from("oportunidade_itens").select("quantidade, valor_unitario").eq("id", id).single();
        const qty = updates.quantidade ?? current?.quantidade ?? 1;
        const unit = updates.valor_unitario ?? (current?.valor_unitario ? Number(current.valor_unitario) : 0);
        patch.valor_total = qty * unit;
      }

      const { data, error } = await supabase.from("oportunidade_itens").update(patch).eq("id", id).select().single();
      if (error) throw error;

      await recalcOportunidadeTotal(oportunidade_id);
      return data;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["oportunidade-itens", vars.oportunidade_id] });
      qc.invalidateQueries({ queryKey: ["oportunidade"] });
      qc.invalidateQueries({ queryKey: ["oportunidades"] });
      toast.success("Item atualizado");
    },
    onError: (e: any) => toast.error(e.message),
  });
}

export function useDeleteOportunidadeItem() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, oportunidade_id }: { id: string; oportunidade_id: string }) => {
      const { error } = await supabase.from("oportunidade_itens").delete().eq("id", id);
      if (error) throw error;
      await recalcOportunidadeTotal(oportunidade_id);
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["oportunidade-itens", vars.oportunidade_id] });
      qc.invalidateQueries({ queryKey: ["oportunidade"] });
      qc.invalidateQueries({ queryKey: ["oportunidades"] });
      toast.success("Item removido");
    },
    onError: (e: any) => toast.error(e.message),
  });
}
