import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { toast } from "sonner";

// Types
export interface LeadSource {
  id: string;
  empresa_id: string | null;
  nome: string;
  tipo: string;
  config: Record<string, any>;
  ativo: boolean;
  created_at: string;
  updated_at: string;
}

export interface ICP {
  id: string;
  empresa_id: string | null;
  nome: string;
  filtros: Record<string, any>;
  created_at: string;
  updated_at: string;
}

export interface LeadSearch {
  id: string;
  empresa_id: string | null;
  source_id: string | null;
  icp_id: string | null;
  nome: string;
  filtros: Record<string, any>;
  status: string;
  leads_encontrados: number;
  leads_importados: number;
  observacoes: string | null;
  created_at: string;
  executed_at: string | null;
}

export interface Lead {
  id: string;
  empresa_id: string | null;
  search_id: string | null;
  nome: string | null;
  cargo: string | null;
  empresa_nome: string | null;
  empresa_linkedin: string | null;
  email: string | null;
  telefone: string | null;
  linkedin_url: string | null;
  pais: string | null;
  estado: string | null;
  cidade: string | null;
  score: number;
  status: string;
  dados_raw: Record<string, any>;
  enrichment_status: string;
  enrichment_tentativas: number;
  created_at: string;
  updated_at: string;
}

export interface EnrichmentPolicy {
  id: string;
  empresa_id: string | null;
  ativa: boolean;
  limite_diario: number;
  limite_por_job: number;
  tentativas_por_lead: number;
  cooldown_horas: number;
  status_permitidos: string[];
  custo_email: number;
  custo_telefone: number;
  created_at: string;
  updated_at: string;
}

export interface EnrichmentJob {
  id: string;
  empresa_id: string | null;
  tipo: string;
  status: string;
  total_leads: number;
  processados: number;
  sucesso: number;
  falhas: number;
  created_at: string;
  completed_at: string | null;
}

export interface EnrichmentQueueItem {
  id: string;
  empresa_id: string | null;
  lead_id: string | null;
  job_id: string | null;
  prioridade: number;
  status: string;
  motivo_skip: string | null;
  erro: string | null;
  created_at: string;
  processed_at: string | null;
}

export interface EnrichmentCredits {
  id: string;
  empresa_id: string | null;
  data: string;
  creditos_usados: number;
  creditos_limite: number;
}

// Lead Sources hooks
export function useLeadSources() {
  return useQuery({
    queryKey: ["lead-sources"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orbit_lead_sources")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as LeadSource[];
    },
  });
}

export function useCreateLeadSource() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (source: Partial<LeadSource>) => {
      const { data, error } = await supabase
        .from("orbit_lead_sources")
        .insert(source)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["lead-sources"] });
      toast.success("Fonte criada com sucesso!");
    },
    onError: (error: Error) => {
      toast.error("Erro ao criar fonte: " + error.message);
    },
  });
}

export function useDeleteLeadSource() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("orbit_lead_sources")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["lead-sources"] });
      toast.success("Fonte removida com sucesso!");
    },
    onError: (error: Error) => {
      toast.error("Erro ao remover fonte: " + error.message);
    },
  });
}

// ICPs hooks
export function useICPs() {
  return useQuery({
    queryKey: ["icps"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orbit_icps")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as ICP[];
    },
  });
}

export function useCreateICP() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (icp: Partial<ICP>) => {
      const { data, error } = await supabase
        .from("orbit_icps")
        .insert(icp)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["icps"] });
      toast.success("ICP criado com sucesso!");
    },
    onError: (error: Error) => {
      toast.error("Erro ao criar ICP: " + error.message);
    },
  });
}

export function useDeleteICP() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("orbit_icps").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["icps"] });
      toast.success("ICP removido com sucesso!");
    },
    onError: (error: Error) => {
      toast.error("Erro ao remover ICP: " + error.message);
    },
  });
}

// Lead Searches hooks
export function useLeadSearches() {
  return useQuery({
    queryKey: ["lead-searches"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orbit_lead_searches")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as LeadSearch[];
    },
  });
}

export function useCreateLeadSearch() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (search: Partial<LeadSearch>) => {
      const { data, error } = await supabase
        .from("orbit_lead_searches")
        .insert(search)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["lead-searches"] });
      toast.success("Busca criada com sucesso!");
    },
    onError: (error: Error) => {
      toast.error("Erro ao criar busca: " + error.message);
    },
  });
}

export function useUpdateLeadSearch() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<LeadSearch> & { id: string }) => {
      const { data, error } = await supabase
        .from("orbit_lead_searches")
        .update(updates)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["lead-searches"] });
    },
  });
}

// Leads hooks
export function useLeads(filters?: { search_id?: string; status?: string; enrichment_status?: string }) {
  return useQuery({
    queryKey: ["leads", filters],
    queryFn: async () => {
      let query = supabase
        .from("orbit_leads")
        .select("*")
        .order("created_at", { ascending: false });

      if (filters?.search_id) {
        query = query.eq("search_id", filters.search_id);
      }
      if (filters?.status) {
        query = query.eq("status", filters.status);
      }
      if (filters?.enrichment_status) {
        query = query.eq("enrichment_status", filters.enrichment_status);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as Lead[];
    },
  });
}

export function useCreateLead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (lead: Partial<Lead>) => {
      const { data, error } = await supabase
        .from("orbit_leads")
        .insert(lead)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["leads"] });
    },
  });
}

export function useUpdateLead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<Lead> & { id: string }) => {
      const { data, error } = await supabase
        .from("orbit_leads")
        .update(updates)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["leads"] });
    },
  });
}

export function useBulkUpdateLeads() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ ids, updates }: { ids: string[]; updates: Partial<Lead> }) => {
      const { error } = await supabase
        .from("orbit_leads")
        .update(updates)
        .in("id", ids);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["leads"] });
      toast.success("Leads atualizados com sucesso!");
    },
    onError: (error: Error) => {
      toast.error("Erro ao atualizar leads: " + error.message);
    },
  });
}

// Enrichment Policy hooks
export function useEnrichmentPolicy() {
  return useQuery({
    queryKey: ["enrichment-policy"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orbit_enrichment_policy")
        .select("*")
        .maybeSingle();
      if (error) throw error;
      return data as EnrichmentPolicy | null;
    },
  });
}

export function useUpsertEnrichmentPolicy() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (policy: Partial<EnrichmentPolicy>) => {
      const { data, error } = await supabase
        .from("orbit_enrichment_policy")
        .upsert(policy, { onConflict: "empresa_id" })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["enrichment-policy"] });
      toast.success("Política salva com sucesso!");
    },
    onError: (error: Error) => {
      toast.error("Erro ao salvar política: " + error.message);
    },
  });
}

// Enrichment Jobs hooks
export function useEnrichmentJobs() {
  return useQuery({
    queryKey: ["enrichment-jobs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orbit_enrichment_jobs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return data as EnrichmentJob[];
    },
  });
}

export function useCreateEnrichmentJob() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (job: Partial<EnrichmentJob>) => {
      const { data, error } = await supabase
        .from("orbit_enrichment_jobs")
        .insert(job)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["enrichment-jobs"] });
    },
  });
}

// Enrichment Queue hooks
export function useEnrichmentQueue() {
  return useQuery({
    queryKey: ["enrichment-queue"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orbit_enrichment_queue")
        .select("*, lead:orbit_leads(*)")
        .order("prioridade", { ascending: false })
        .order("created_at", { ascending: true })
        .limit(50);
      if (error) throw error;
      return data as (EnrichmentQueueItem & { lead: Lead })[];
    },
  });
}

// Enrichment Credits hooks
export function useEnrichmentCredits() {
  return useQuery({
    queryKey: ["enrichment-credits"],
    queryFn: async () => {
      const today = new Date().toISOString().split("T")[0];
      const { data, error } = await supabase
        .from("orbit_enrichment_credits")
        .select("*")
        .eq("data", today)
        .maybeSingle();
      if (error) throw error;
      return data as EnrichmentCredits | null;
    },
  });
}

// Stats
export function useLeadFinderStats() {
  const { data: sources } = useLeadSources();
  const { data: searches } = useLeadSearches();
  const { data: leads } = useLeads();
  const { data: credits } = useEnrichmentCredits();
  const { data: jobs } = useEnrichmentJobs();

  return {
    sourcesCount: sources?.filter((s) => s.ativo).length ?? 0,
    searchesCount: searches?.length ?? 0,
    leadsFound: leads?.length ?? 0,
    newLeads: leads?.filter((l) => l.status === "novo").length ?? 0,
    creditsUsed: credits?.creditos_usados ?? 0,
    creditsLimit: credits?.creditos_limite ?? 1000,
    activeJobs: jobs?.filter((j) => j.status === "processando").length ?? 0,
    successRate: jobs?.length
      ? Math.round(
          (jobs.reduce((acc, j) => acc + j.sucesso, 0) /
            jobs.reduce((acc, j) => acc + j.total_leads, 0)) *
            100
        ) || 0
      : 0,
  };
}
