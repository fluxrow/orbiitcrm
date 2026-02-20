import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export function useTenantMaps() {
  return useQuery({
    queryKey: ["tenant-maps"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pe_tenant_map" as any)
        .select("*");
      if (error) throw error;
      return data as any[];
    },
  });
}

export function useUpsertTenantMap() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: { empresa_id: string; organization_id: string }) => {
      const { data, error } = await supabase.rpc("pe_upsert_tenant_map" as any, {
        p_empresa_id: params.empresa_id,
        p_organization_id: params.organization_id,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tenant-maps"] });
      toast.success("Mapeamento salvo com sucesso");
    },
    onError: (e: any) => {
      const msg = e?.message || "";
      if (msg.includes("organization_not_found")) {
        toast.error("Organização não encontrada");
      } else if (msg.includes("empresa_not_found")) {
        toast.error("Empresa não encontrada");
      } else if (msg.includes("duplicate key") || msg.includes("unique constraint")) {
        toast.error("Esta organização já está mapeada para outra empresa");
      } else {
        toast.error(msg || "Erro ao salvar mapeamento");
      }
    },
  });
}

export function useDeleteTenantMap() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (empresa_id: string) => {
      const { error } = await supabase.rpc("pe_delete_tenant_map" as any, {
        p_empresa_id: empresa_id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tenant-maps"] });
      toast.success("Mapeamento removido");
    },
    onError: (e: any) => toast.error(e?.message || "Erro ao remover mapeamento"),
  });
}
