import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useTenant } from "@/contexts/TenantContext";
import { isTenantFeatureEnabled } from "@/lib/tenant-explicit-mutations";

export const TENANT_GOOGLE_CONTEXT_WAVE3_FLAG = "tenant_google_context_wave3_v1" as const;

export async function getGoogleTenantPayload(empresaId: string, tenantSlug?: string | null) {
  if (tenantSlug && await isTenantFeatureEnabled(empresaId, TENANT_GOOGLE_CONTEXT_WAVE3_FLAG)) {
    return { tenant_slug: tenantSlug, empresa_id: empresaId };
  }
  return { empresa_id: empresaId };
}

export interface GoogleStatus {
  connected: boolean;
  google_email: string | null;
  calendar_id: string | null;
  timezone: string | null;
  availability_start: string;
  availability_end: string;
  booking_min_notice_minutes: number;
  booking_max_horizon_days: number;
  connected_at: string | null;
  provider_configured: boolean;
}

export function useGoogleCalendarStatus(empresaId: string | null | undefined) {
  const { slug } = useTenant();
  return useQuery({
    queryKey: ["google-calendar-status", empresaId, slug],
    enabled: !!empresaId,
    queryFn: async (): Promise<GoogleStatus> => {
      // GET com query string via fetch direto (functions.invoke não suporta GET nativo)
      const query = new URLSearchParams(await getGoogleTenantPayload(empresaId!, slug)).toString();
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/orbit-google-status?${query}`;
      const { data: sess } = await supabase.auth.getSession();
      const r = await fetch(url, {
        headers: {
          Authorization: `Bearer ${sess.session?.access_token ?? ""}`,
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? "",
        },
      });
      const j = await r.json();
      if (!j?.ok) throw new Error(j?.error?.message ?? "Falha ao consultar status");
      return j.data as GoogleStatus;
    },
  });
}

export function useConnectGoogleCalendar() {
  const { slug } = useTenant();
  return useMutation({
    mutationFn: async (empresaId: string) => {
      const redirectAfter =
        typeof window !== "undefined"
          ? `${window.location.origin}${window.location.pathname}${window.location.search || ""}`
          : undefined;
      const tenant = await getGoogleTenantPayload(empresaId, slug);
      const { data, error } = await supabase.functions.invoke("orbit-google-auth", {
        body: { ...tenant, redirect_after: redirectAfter },
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
  const { slug } = useTenant();
  return useMutation({
    mutationFn: async (empresaId: string) => {
      const tenant = await getGoogleTenantPayload(empresaId, slug);
      const { data, error } = await supabase.functions.invoke("orbit-google-disconnect", {
        body: tenant,
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
  const { slug } = useTenant();
  return useMutation({
    mutationFn: async (params: { empresaId: string; calendar_id?: string; timezone?: string; availability_start?: string; availability_end?: string; booking_min_notice_minutes?: number; booking_max_horizon_days?: number }) => {
      const tenant = await getGoogleTenantPayload(params.empresaId, slug);
      const { data, error } = await supabase.functions.invoke("orbit-google-calendar", {
        body: {
          action: "update_config",
          ...tenant,
          calendar_id: params.calendar_id,
          timezone: params.timezone,
          availability_start: params.availability_start,
          availability_end: params.availability_end,
          booking_min_notice_minutes: params.booking_min_notice_minutes,
          booking_max_horizon_days: params.booking_max_horizon_days,
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
  const { slug } = useTenant();
  return useQuery({
    queryKey: ["google-calendar-upcoming", empresaId, slug],
    enabled: !!empresaId && enabled,
    queryFn: async () => {
      const tenant = await getGoogleTenantPayload(empresaId!, slug);
      const { data, error } = await supabase.functions.invoke("orbit-google-calendar", {
        body: { action: "list_events", ...tenant, max: 10 },
      });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.error?.message ?? "Falha ao listar eventos");
      return (data.data?.events?.items ?? []) as any[];
    },
  });
}

export function useCalendarEventsRange(
  empresaId: string | null | undefined,
  startISO: string,
  endISO: string,
  enabled: boolean,
  refetchIntervalMs?: number | false,
) {
  const { slug } = useTenant();
  return useQuery({
    queryKey: ["google-calendar-range", empresaId, slug, startISO, endISO],
    enabled: !!empresaId && enabled && !!startISO && !!endISO,
    staleTime: 60_000,
    refetchInterval: refetchIntervalMs && refetchIntervalMs > 0 ? refetchIntervalMs : false,
    refetchIntervalInBackground: true,
    queryFn: async () => {
      const tenant = await getGoogleTenantPayload(empresaId!, slug);
      const { data, error } = await supabase.functions.invoke("orbit-google-calendar", {
        body: {
          action: "list_events",
          ...tenant,
          time_min: startISO,
          time_max: endISO,
          max: 250,
        },
      });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.error?.message ?? "Falha ao listar eventos");
      return (data.data?.events?.items ?? []) as any[];
    },
  });
}
