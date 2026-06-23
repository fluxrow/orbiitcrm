import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface GoogleStatus {
  connected: boolean;
  google_email: string | null;
  calendar_id: string | null;
  timezone: string | null;
  connected_at: string | null;
  provider_configured: boolean;
}

export function useGoogleCalendarStatus(empresaId: string | null | undefined) {
  return useQuery({
    queryKey: ["google-calendar-status", empresaId],
    enabled: !!empresaId,
    queryFn: async (): Promise<GoogleStatus> => {
      const { data, error } = await supabase.functions.invoke("orbit-google-status", {
        method: "GET" as any,
        body: undefined,
        // @ts-expect-error: supabase-js permite query via URL prop interna
        headers: undefined,
      } as any).catch(async () => {
        // Fallback manual via fetch para GET com query
        const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/orbit-google-status?empresa_id=${empresaId}`;
        const { data: session } = await supabase.auth.getSession();
        const r = await fetch(url, {
          headers: { Authorization: `Bearer ${session.session?.access_token}` },
        });
        const j = await r.json();
        return { data: j, error: null } as any;
      });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.error?.message ?? "Falha ao consultar status");
      return data.data as GoogleStatus;
    },
  });
}

export function useConnectGoogleCalendar() {
  return useMutation({
    mutationFn: async (empresaId: string) => {
      const { data, error } = await supabase.functions.invoke("orbit-google-auth", {
        body: { empresa_id: empresaId },
      });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.error?.message ?? "Falha ao iniciar conexão");
      return data.data as { url: string; state: string };
    },
    onError: (e: any) => toast.error(e.message || "Erro ao conectar Google Calendar"),
  });
}

export function useDisconnectGoogleCalendar() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (empresaId: string) => {
      const { data, error } = await supabase.functions.invoke("orbit-google-disconnect", {
        body: { empresa_id: empresaId },
      });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.error?.message ?? "Falha ao desconectar");
      return data.data;
    },
    onSuccess: () => {
      toast.success("Google Calendar desconectado");
      qc.invalidateQueries({ queryKey: ["google-calendar-status"] });
    },
    onError: (e: any) => toast.error(e.message || "Erro ao desconectar"),
  });
}

export function useUpdateGoogleCalendarConfig() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: { empresaId: string; calendar_id?: string; timezone?: string }) => {
      const { data, error } = await supabase.functions.invoke("orbit-google-calendar", {
        body: {
          action: "update_config",
          empresa_id: params.empresaId,
          calendar_id: params.calendar_id,
          timezone: params.timezone,
        },
      });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.error?.message ?? "Falha ao atualizar");
      return data.data;
    },
    onSuccess: () => {
      toast.success("Configurações de agenda salvas");
      qc.invalidateQueries({ queryKey: ["google-calendar-status"] });
    },
    onError: (e: any) => toast.error(e.message || "Erro ao salvar"),
  });
}

export function useUpcomingCalendarEvents(empresaId: string | null | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ["google-calendar-upcoming", empresaId],
    enabled: !!empresaId && enabled,
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("orbit-google-calendar", {
        body: { action: "list_events", empresa_id: empresaId, max: 10 },
      });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.error?.message ?? "Falha ao listar eventos");
      return (data.data?.events?.items ?? []) as any[];
    },
  });
}
