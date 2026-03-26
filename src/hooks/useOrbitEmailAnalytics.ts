import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

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

/** Paginated recipients with exact count */
export function useOrbitCampaignRecipients(
  campaignId: string | null,
  page: number,
  pageSize: number = 50
) {
  return useQuery({
    queryKey: ["orbit_campaign_recipients_page", campaignId, page, pageSize],
    queryFn: async () => {
      if (!campaignId) throw new Error("No campaign");

      const from = page * pageSize;
      const to = from + pageSize - 1;

      const { data, error, count } = await supabase
        .from("orbit_campaign_recipients")
        .select(
          "id, email, status, engagement_status, enviado_em, delivered_at, opened_at, clicked_at, bounced_at, complained_at, prospect:orbit_prospects(nome_razao)",
          { count: "exact" }
        )
        .eq("campaign_id", campaignId)
        .order("enviado_em", { ascending: false, nullsFirst: false })
        .range(from, to);

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
