import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface EmailAnalytics {
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
  recipients: RecipientDetail[];
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

export function useOrbitEmailAnalytics(campaignId: string | null) {
  return useQuery({
    queryKey: ["orbit_email_analytics", campaignId],
    queryFn: async (): Promise<EmailAnalytics> => {
      if (!campaignId) throw new Error("No campaign");

      const { data: recipients, error } = await supabase
        .from("orbit_campaign_recipients")
        .select("id, email, status, engagement_status, enviado_em, delivered_at, opened_at, clicked_at, bounced_at, complained_at, prospect:orbit_prospects(nome_razao)")
        .eq("campaign_id", campaignId);

      if (error) throw error;

      const items = (recipients || []) as any[];
      const totalRecipients = items.length;
      const total = items.filter(r => r.status !== "pendente").length;
      const delivered = items.filter(r => r.delivered_at).length;
      const opened = items.filter(r => r.opened_at).length;
      const clicked = items.filter(r => r.clicked_at).length;
      const bounced = items.filter(r => r.bounced_at).length;
      const complained = items.filter(r => r.complained_at).length;
      const noInteraction = items.filter(r =>
        r.delivered_at && !r.opened_at && !r.clicked_at && !r.bounced_at && !r.complained_at
      ).length;

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
        recipients: items.map(r => ({
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
        })),
      };
    },
    enabled: !!campaignId,
  });
}
