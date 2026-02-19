import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { toast } from "sonner";

export function useOrganizations() {
  return useQuery({
    queryKey: ["organizations"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("organizations" as any)
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as any[];
    },
  });
}

export function useOrganization(id: string | undefined) {
  return useQuery({
    queryKey: ["organization", id],
    queryFn: async () => {
      if (!id) return null;
      const { data, error } = await supabase
        .from("organizations" as any)
        .select("*")
        .eq("id", id)
        .single();
      if (error) throw error;
      return data as any;
    },
    enabled: !!id,
  });
}

export function useCreateOrganization() {
  const qc = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (org: { name: string; legal_name?: string; cnpj?: string }) => {
      const { data, error } = await supabase
        .from("organizations" as any)
        .insert(org)
        .select()
        .single();
      if (error) throw error;

      // Audit log
      await supabase.from("pe_audit_log" as any).insert({
        organization_id: (data as any).id,
        actor_user_id: user?.id,
        action: "ORG_CREATED",
        entity_type: "organization",
        entity_id: (data as any).id,
        metadata: org,
      });

      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["organizations"] });
      toast.success("Organização criada com sucesso");
    },
    onError: (e: any) => toast.error(e.message),
  });
}

export function useUpdateOrganization() {
  const qc = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({ id, ...updates }: { id: string; name?: string; legal_name?: string; cnpj?: string }) => {
      const { data, error } = await supabase
        .from("organizations" as any)
        .update(updates)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;

      await supabase.from("pe_audit_log" as any).insert({
        organization_id: id,
        actor_user_id: user?.id,
        action: "ORG_UPDATED",
        entity_type: "organization",
        entity_id: id,
        metadata: updates,
      });

      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["organizations"] });
      toast.success("Organização atualizada");
    },
    onError: (e: any) => toast.error(e.message),
  });
}

export function useToggleOrgStatus() {
  const qc = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const newStatus = status === "active" ? "inactive" : "active";
      const { error } = await supabase
        .from("organizations" as any)
        .update({ status: newStatus })
        .eq("id", id);
      if (error) throw error;

      await supabase.from("pe_audit_log" as any).insert({
        organization_id: id,
        actor_user_id: user?.id,
        action: "ORG_STATUS_CHANGED",
        entity_type: "organization",
        entity_id: id,
        metadata: { old_status: status, new_status: newStatus },
      });

      return newStatus;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["organizations"] });
      toast.success("Status atualizado");
    },
    onError: (e: any) => toast.error(e.message),
  });
}
