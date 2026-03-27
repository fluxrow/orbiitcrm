import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/* ─── Email Campaign Types ─── */

export interface CampaignSummary {
  totalRecipients: number;
  total: number;
  delivered: number;
  opened: number;
  clicked: number;
  bounced: number;
  complained: number;
  noInteraction: number;
  openRate: number;
  clickRate: number;
  bounceRate: number;
}

export interface RecipientDetail {
  id: string;
  email: string | null;
  prospect_name: string | null;
  status: string | null;
  engagement_status: string | null;
  enviado_em: string | null;
  delivered_at: string | null;
  opened_at: string | null;
  clicked_at: string | null;
  bounced_at: string | null;
  complained_at: string | null;
}

export interface TimelinePoint {
  bucket: string;
  enviados: number;
  entregues: number;
  aberturas: number;
  cliques: number;
  leituras: number;
  respostas: number;
}

export type EngagementFilter =
  | "todos"
  | "abriu"
  | "nao_abriu"
  | "clicou"
  | "nao_clicou"
  | "falhou";

/* ─── WhatsApp Campaign Types ─── */

export interface WhatsAppCampaignSummary {
  totalRecipients: number;
  total: number;
  delivered: number;
  read: number;
  replied: number;
  failed: number;
  pending: number;
  readRate: number;
  replyRate: number;
}

export type WhatsAppEngagementFilter =
  | "todos"
  | "enviado"
  | "entregue"
  | "lido"
  | "respondeu"
  | "falhou"
  | "sem_resposta";

export interface WhatsAppRecipientDetail {
  id: string;
  telefone: string | null;
  email: string | null;
  prospect_name: string | null;
  prospect_empresa: string | null;
  status: string | null;
  enviado_em: string | null;
  delivered_at: string | null;
  read_at: string | null;
  replied_at: string | null;
  erro: string | null;
}

/* ─── Email Hooks ─── */

/** Aggregated metrics via server-side RPC — no row limit */
export function useOrbitCampaignSummary(campaignId: string | null) {
  return useQuery({
    queryKey: ["orbit_campaign_summary", campaignId],
    queryFn: async (): Promise<CampaignSummary> => {
      if (!campaignId) throw new Error("No campaign");

      const { data, error } = await supabase.rpc("get_campaign_analytics_summary", {
        p_campaign_id: campaignId,
      });

      if (error) throw error;

      const row = (data as any[])?.[0] || {};
      const totalRecipients = Number(row.total_recipients || 0);
      const total = Number(row.total_sent || 0);
      const delivered = Number(row.delivered || 0);
      const opened = Number(row.opened || 0);
      const clicked = Number(row.clicked || 0);
      const bounced = Number(row.bounced || 0);
      const complained = Number(row.complained || 0);
      const noInteraction = Number(row.no_interaction || 0);

      return {
        totalRecipients,
        total,
        delivered,
        opened,
        clicked,
        bounced,
        complained,
        noInteraction,
        openRate: total > 0 ? (opened / total) * 100 : 0,
        clickRate: total > 0 ? (clicked / total) * 100 : 0,
        bounceRate: total > 0 ? (bounced / total) * 100 : 0,
      };
    },
    enabled: !!campaignId,
  });
}

/** Timeline data for charts */
export function useOrbitCampaignTimeline(
  campaignId: string | null,
  interval: string = "1 day"
) {
  return useQuery({
    queryKey: ["orbit_campaign_timeline", campaignId, interval],
    queryFn: async (): Promise<TimelinePoint[]> => {
      if (!campaignId) throw new Error("No campaign");

      const { data, error } = await supabase.rpc("get_campaign_events_timeline", {
        p_campaign_id: campaignId,
        p_interval: interval,
      });

      if (error) throw error;

      return ((data as any[]) || []).map((r) => ({
        bucket: r.bucket,
        enviados: Number(r.enviados || 0),
        entregues: Number(r.entregues || 0),
        aberturas: Number(r.aberturas || 0),
        cliques: Number(r.cliques || 0),
        leituras: Number(r.leituras || 0),
        respostas: Number(r.respostas || 0),
      }));
    },
    enabled: !!campaignId,
  });
}

/** Paginated recipients with exact count and optional engagement filter */
export function useOrbitCampaignRecipients(
  campaignId: string | null,
  page: number,
  pageSize: number = 50,
  engagementFilter: EngagementFilter = "todos"
) {
  return useQuery({
    queryKey: ["orbit_campaign_recipients_page", campaignId, page, pageSize, engagementFilter],
    queryFn: async () => {
      if (!campaignId) throw new Error("No campaign");

      const from = page * pageSize;
      const to = from + pageSize - 1;

      let query = supabase
        .from("orbit_campaign_recipients")
        .select(
          "id, email, status, engagement_status, enviado_em, delivered_at, opened_at, clicked_at, bounced_at, complained_at, prospect:orbit_prospects(nome_razao)",
          { count: "exact" }
        )
        .eq("campaign_id", campaignId)
        .order("enviado_em", { ascending: false, nullsFirst: false });

      switch (engagementFilter) {
        case "abriu":
          query = query.not("opened_at", "is", null);
          break;
        case "nao_abriu":
          query = query.is("opened_at", null).neq("status", "pendente");
          break;
        case "clicou":
          query = query.not("clicked_at", "is", null);
          break;
        case "nao_clicou":
          query = query.is("clicked_at", null).not("opened_at", "is", null);
          break;
        case "falhou":
          query = query.in("engagement_status", ["bounced", "complained"]);
          break;
      }

      const { data, error, count } = await query.range(from, to);

      if (error) throw error;

      const recipients: RecipientDetail[] = ((data || []) as any[]).map((r) => ({
        id: r.id,
        email: r.email,
        prospect_name: r.prospect?.nome_razao || null,
        status: r.status,
        engagement_status: r.engagement_status,
        enviado_em: r.enviado_em,
        delivered_at: r.delivered_at,
        opened_at: r.opened_at,
        clicked_at: r.clicked_at,
        bounced_at: r.bounced_at,
        complained_at: r.complained_at,
      }));

      return { recipients, totalCount: count || 0 };
    },
    enabled: !!campaignId,
  });
}

/* ─── WhatsApp Hooks ─── */

/** WhatsApp campaign summary via RPC */
export function useWhatsAppCampaignSummary(campaignId: string | null) {
  return useQuery({
    queryKey: ["whatsapp_campaign_summary", campaignId],
    queryFn: async (): Promise<WhatsAppCampaignSummary> => {
      if (!campaignId) throw new Error("No campaign");

      const { data, error } = await (supabase.rpc as any)("get_whatsapp_campaign_summary", {
        p_campaign_id: campaignId,
      });

      if (error) throw error;

      const row = (data as any[])?.[0] || {};
      const totalRecipients = Number(row.total_recipients || 0);
      const total = Number(row.total_sent || 0);
      const delivered = Number(row.delivered || 0);
      const read = Number(row.read || 0);
      const replied = Number(row.replied || 0);
      const failed = Number(row.failed || 0);
      const pending = Number(row.pending || 0);

      return {
        totalRecipients,
        total,
        delivered,
        read,
        replied,
        failed,
        pending,
        readRate: total > 0 ? (read / total) * 100 : 0,
        replyRate: total > 0 ? (replied / total) * 100 : 0,
      };
    },
    enabled: !!campaignId,
  });
}

/** Paginated WhatsApp recipients with server-side filter */
export function useWhatsAppCampaignRecipients(
  campaignId: string | null,
  page: number,
  pageSize: number = 50,
  filter: WhatsAppEngagementFilter = "todos"
) {
  return useQuery({
    queryKey: ["whatsapp_campaign_recipients_page", campaignId, page, pageSize, filter],
    queryFn: async () => {
      if (!campaignId) throw new Error("No campaign");

      const from = page * pageSize;
      const to = from + pageSize - 1;

      let query = supabase
        .from("orbit_campaign_recipients")
        .select(
          "id, telefone, email, status, enviado_em, delivered_at, read_at, replied_at, erro, prospect:orbit_prospects(nome_razao, nome_fantasia)",
          { count: "exact" }
        )
        .eq("campaign_id", campaignId)
        .order("enviado_em", { ascending: false, nullsFirst: false });

      switch (filter) {
        case "enviado":
          query = query.neq("status", "pendente").neq("status", "ignorado");
          break;
        case "entregue":
          query = query.not("delivered_at", "is", null);
          break;
        case "lido":
          query = query.not("read_at", "is", null);
          break;
        case "respondeu":
          query = query.not("replied_at", "is", null);
          break;
        case "falhou":
          query = query.eq("status", "falhou");
          break;
        case "sem_resposta":
          query = query.is("replied_at", null).not("delivered_at", "is", null);
          break;
      }

      const { data, error, count } = await query.range(from, to);

      if (error) throw error;

      const recipients: WhatsAppRecipientDetail[] = ((data || []) as any[]).map((r) => ({
        id: r.id,
        telefone: r.telefone,
        email: r.email,
        prospect_name: r.prospect?.nome_razao || null,
        prospect_empresa: r.prospect?.nome_fantasia || null,
        status: r.status,
        enviado_em: r.enviado_em,
        delivered_at: r.delivered_at,
        read_at: r.read_at,
        replied_at: r.replied_at,
        erro: r.erro,
      }));

      return { recipients, totalCount: count || 0 };
    },
    enabled: !!campaignId,
  });
}

// --- Legacy compatibility aliases ---

export interface EmailAnalytics extends CampaignSummary {
  recipients: RecipientDetail[];
}

/** @deprecated Use useOrbitCampaignSummary + useOrbitCampaignRecipients */
export function useOrbitCampaignAnalytics(campaignId: string | null) {
  return useOrbitCampaignSummary(campaignId);
}

/** @deprecated Use useOrbitCampaignSummary + useOrbitCampaignRecipients */
export const useOrbitEmailAnalytics = useOrbitCampaignSummary;
