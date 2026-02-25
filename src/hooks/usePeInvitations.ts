import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { toast } from "sonner";

export function useOrgInvitations(orgId: string | null | undefined) {
  return useQuery({
    queryKey: ["org-invitations", orgId],
    queryFn: async () => {
      if (!orgId) return [];
      const { data, error } = await supabase
        .from("pe_invitations" as any)
        .select("*, pe_roles(code, name)")
        .eq("organization_id", orgId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as any[];
    },
    enabled: !!orgId,
  });
}

export function useCancelInvitation() {
  const qc = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({ id, orgId }: { id: string; orgId: string }) => {
      const { error } = await supabase
        .from("pe_invitations" as any)
        .update({ status: "canceled" })
        .eq("id", id);
      if (error) throw error;

      await supabase.from("pe_audit_log" as any).insert({
        organization_id: orgId,
        actor_user_id: user?.id,
        action: "INVITE_CANCELED",
        entity_type: "invitation",
        entity_id: id,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["org-invitations"] });
      toast.success("Convite cancelado");
    },
    onError: (e: any) => toast.error(e.message),
  });
}

export function useResendInvitation() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, orgId, email, role_code, full_name }: {
      id: string; orgId: string; email: string; role_code: string; full_name?: string;
    }) => {
      // Cancel old invitation
      await supabase
        .from("pe_invitations" as any)
        .update({ status: "canceled" })
        .eq("id", id);

      // Create new invitation via edge function
      const { data, error } = await supabase.functions.invoke("invite-org-user", {
        body: { organization_id: orgId, email, role_code, full_name },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["org-invitations"] });
      toast.success("Convite reenviado com sucesso");
    },
    onError: (e: any) => toast.error(e.message),
  });
}
