import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export function useAuditLog(orgId?: string | null, filters?: { startDate?: string; endDate?: string }) {
  return useQuery({
    queryKey: ["pe-audit-log", orgId, filters],
    queryFn: async () => {
      let query = supabase
        .from("pe_audit_log" as any)
        .select("*, pe_users:actor_user_id(full_name, email), organizations:organization_id(name)")
        .order("created_at", { ascending: false })
        .limit(200);

      if (orgId) {
        query = query.eq("organization_id", orgId);
      }

      if (filters?.startDate) {
        query = query.gte("created_at", filters.startDate);
      }
      if (filters?.endDate) {
        query = query.lte("created_at", filters.endDate);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as any[];
    },
  });
}
