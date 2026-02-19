import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { toast } from "sonner";

export function useOrgUsers(orgId: string | null | undefined) {
  return useQuery({
    queryKey: ["org-users", orgId],
    queryFn: async () => {
      if (!orgId) return [];
      const { data, error } = await supabase
        .from("pe_users" as any)
        .select("*, pe_roles(code, name)")
        .eq("organization_id", orgId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as any[];
    },
    enabled: !!orgId,
  });
}

export function useUpdateOrgUser() {
  const qc = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({ userId, orgId, ...updates }: { userId: string; orgId: string; role_id?: string; is_active?: boolean; full_name?: string; phone?: string }) => {
      const { error } = await supabase
        .from("pe_users" as any)
        .update(updates)
        .eq("id", userId);
      if (error) throw error;

      const action = updates.role_id ? "ROLE_CHANGED" : updates.is_active !== undefined ? "USER_STATUS_CHANGED" : "USER_UPDATED";

      await supabase.from("pe_audit_log" as any).insert({
        organization_id: orgId,
        actor_user_id: user?.id,
        action,
        entity_type: "user",
        entity_id: userId,
        metadata: updates,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["org-users"] });
      toast.success("Usuário atualizado");
    },
    onError: (e: any) => toast.error(e.message),
  });
}

export function useInviteUser() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (payload: { organization_id: string; email: string; role_code: string; full_name?: string; phone?: string }) => {
      const { data, error } = await supabase.functions.invoke("invite-org-user", {
        body: payload,
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["org-invitations"] });
      toast.success("Convite enviado com sucesso");
    },
    onError: (e: any) => toast.error(e.message),
  });
}
