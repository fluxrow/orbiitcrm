import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

interface OrigemItem {
  name: string;
  value: number;
}

interface MonthProspects {
  month: string;
  leads: number;
}

interface MonthDeals {
  month: string;
  total: number;
  won: number;
}

interface TeamMember {
  name: string;
  leads: number;
  conversao: number;
}

export interface AnalyticsSummary {
  totalProspects: number;
  prospectsMesAtual: number;
  prospectsMesAnterior: number;
  conversasAtivas: number;
  conversasOntem: number;
  pipelineTotal: number;
  pipelineMesAnterior: number;
  dealsTotal: number;
  dealsWon: number;
  dealsTotalAnterior: number;
  dealsWonAnterior: number;
  origemDistribution: OrigemItem[];
  prospectsPorMes: MonthProspects[];
  dealsPorMes: MonthDeals[];
  performanceEquipe: TeamMember[];
  // Computed
  taxaConversao: number;
  taxaConversaoAnterior: number;
  prospectChangePercent: number;
  pipelineChangePercent: number;
  taxaConversaoChange: number;
}

const MONTH_LABELS: Record<string, string> = {
  "01": "Jan", "02": "Fev", "03": "Mar", "04": "Abr",
  "05": "Mai", "06": "Jun", "07": "Jul", "08": "Ago",
  "09": "Set", "10": "Out", "11": "Nov", "12": "Dez",
};

function formatMonth(yyyymm: string): string {
  const parts = yyyymm.split("-");
  return MONTH_LABELS[parts[1]] || parts[1];
}

function pctChange(current: number, previous: number): number {
  if (previous === 0) return current > 0 ? 100 : 0;
  return Math.round(((current - previous) / previous) * 100);
}

export function useOrbitAnalyticsSummary(empresaId: string | null) {
  return useQuery({
    queryKey: ["orbit_analytics_summary", empresaId],
    queryFn: async (): Promise<AnalyticsSummary> => {
      const { data, error } = await supabase.rpc("get_orbit_analytics_summary" as any, {
        p_empresa_id: empresaId,
      });
      if (error) throw error;

      const d = data as any;

      const totalProspects = Number(d.total_prospects) || 0;
      const prospectsMesAtual = Number(d.prospects_mes_atual) || 0;
      const prospectsMesAnterior = Number(d.prospects_mes_anterior) || 0;
      const conversasAtivas = Number(d.conversas_ativas) || 0;
      const conversasOntem = Number(d.conversas_ontem) || 0;
      const pipelineTotal = Number(d.pipeline_total) || 0;
      const pipelineMesAnterior = Number(d.pipeline_mes_anterior) || 0;
      const dealsTotal = Number(d.deals_total) || 0;
      const dealsWon = Number(d.deals_won) || 0;
      const dealsTotalAnterior = Number(d.deals_total_anterior) || 0;
      const dealsWonAnterior = Number(d.deals_won_anterior) || 0;

      const taxaConversao = dealsTotal > 0 ? Math.round((dealsWon / dealsTotal) * 1000) / 10 : 0;
      const taxaConversaoAnterior = dealsTotalAnterior > 0 ? Math.round((dealsWonAnterior / dealsTotalAnterior) * 1000) / 10 : 0;

      const origemRaw = (d.origem_distribution || []) as { name: string; value: number }[];
      const totalOrigem = origemRaw.reduce((s, i) => s + Number(i.value), 0);
      const origemDistribution: OrigemItem[] = origemRaw.map((i) => ({
        name: i.name,
        value: totalOrigem > 0 ? Math.round((Number(i.value) / totalOrigem) * 100) : 0,
      }));

      const prospectsPorMes: MonthProspects[] = ((d.prospects_por_mes || []) as any[]).map((i) => ({
        month: formatMonth(i.month),
        leads: Number(i.leads) || 0,
      }));

      const dealsPorMes: MonthDeals[] = ((d.deals_por_mes || []) as any[]).map((i) => ({
        month: formatMonth(i.month),
        total: Number(i.total) || 0,
        won: Number(i.won) || 0,
      }));

      // Merge prospects + deals into conversion data
      const performanceEquipe: TeamMember[] = ((d.performance_equipe || []) as any[]).map((i) => ({
        name: i.name,
        leads: Number(i.leads) || 0,
        conversao: Number(i.conversao) || 0,
      }));

      return {
        totalProspects,
        prospectsMesAtual,
        prospectsMesAnterior,
        conversasAtivas,
        conversasOntem,
        pipelineTotal,
        pipelineMesAnterior,
        dealsTotal,
        dealsWon,
        dealsTotalAnterior,
        dealsWonAnterior,
        origemDistribution,
        prospectsPorMes,
        dealsPorMes,
        performanceEquipe,
        taxaConversao,
        taxaConversaoAnterior,
        prospectChangePercent: pctChange(prospectsMesAtual, prospectsMesAnterior),
        pipelineChangePercent: pctChange(pipelineTotal, pipelineMesAnterior),
        taxaConversaoChange: Math.round((taxaConversao - taxaConversaoAnterior) * 10) / 10,
      };
    },
    enabled: !!empresaId,
  });
}
