import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/contexts/TenantContext";

export type ZapiConnectionStatus = {
  status: "connected" | "disconnected" | "not_configured";
  instance_id: string | null;
  last_disconnect_at: string | null;
  last_receive_at: string | null;
  disconnect_reason: string | null;
};

export function useZapiConnectionStatus() {
  const { empresaId } = useTenant();
  return useQuery<ZapiConnectionStatus | null>({
    queryKey: ["orbit_zapi_connection_status", empresaId],
    enabled: !!empresaId,
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data, error } = await (supabase.rpc as any)(
        "orbit_zapi_connection_status",
        { _empresa_id: empresaId },
      );
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      return (row ?? null) as ZapiConnectionStatus | null;
    },
  });
}
