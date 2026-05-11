import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { toast } from "sonner";
import { handleApiResponse } from "@/lib/api-envelope";

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
    mutationFn: async (source: { nome: string; tipo: string; config?: Record<string, any>; ativo?: boolean; empresa_id?: string | null }) => {
      // Resolve empresa_id from caller or from the user's profile (super-admin fallback handled by RLS)
      let empresaId = source.empresa_id ?? null;
      if (!empresaId) {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const { data: profile } = await supabase
            .from("profiles")
            .select("empresa_id")
            .eq("id", user.id)
            .maybeSingle();
          empresaId = profile?.empresa_id ?? null;
        }
      }
      if (!empresaId) {
        throw new Error("Empresa não identificada. Acesse pela URL da sua empresa antes de criar uma fonte.");
      }

      const { data, error } = await supabase
        .from("orbit_lead_sources")
        .insert({
          nome: source.nome,
          tipo: source.tipo,
          config: source.config || {},
          ativo: source.ativo ?? true,
          empresa_id: empresaId,
        })
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
    mutationFn: async (icp: { nome: string; filtros?: Record<string, any> }) => {
      const { data, error } = await supabase
        .from("orbit_icps")
        .insert({
          nome: icp.nome,
          filtros: icp.filtros || {},
        })
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
    mutationFn: async (search: { 
      nome: string; 
      source_id?: string | null; 
      icp_id?: string | null; 
      filtros?: Record<string, any>; 
      observacoes?: string | null;
      status?: string;
    }) => {
      const { data, error } = await supabase
        .from("orbit_lead_searches")
        .insert({
          nome: search.nome,
          source_id: search.source_id || null,
          icp_id: search.icp_id || null,
          filtros: search.filtros || {},
          observacoes: search.observacoes || null,
          status: search.status || "pendente",
        })
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

// Execute Lead Search - calls Apollo API
export function useExecuteLeadSearch() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (searchId: string) => {
      const response = await supabase.functions.invoke("orbit-search-leads", {
        body: { search_id: searchId },
      });
      return handleApiResponse(response);
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["lead-searches"] });
      queryClient.invalidateQueries({ queryKey: ["leads"] });
      toast.success(`Busca concluída! ${data.imported} leads importados.`);
    },
    onError: (error: Error) => {
      toast.error("Erro ao executar busca: " + error.message);
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

// ============= CSV Lead Import =============

export interface ParsedLeadRow {
  nome?: string;
  email?: string;
  telefone?: string;
  cargo?: string;
  empresa_nome?: string;
  cidade?: string;
  estado?: string;
  pais?: string;
  linkedin_url?: string;
  empresa_linkedin?: string;
}

const LEAD_COLUMN_MAP: Record<string, keyof ParsedLeadRow> = {
  nome: "nome", name: "nome", "nome completo": "nome", "full name": "nome", contato: "nome",
  email: "email", "e-mail": "email", "email principal": "email",
  telefone: "telefone", phone: "telefone", celular: "telefone", whatsapp: "telefone",
  cargo: "cargo", title: "cargo", "job title": "cargo", funcao: "cargo",
  empresa: "empresa_nome", empresa_nome: "empresa_nome", company: "empresa_nome", "razao social": "empresa_nome", razao_social: "empresa_nome",
  cidade: "cidade", city: "cidade",
  estado: "estado", uf: "estado", state: "estado",
  pais: "pais", country: "pais",
  linkedin: "linkedin_url", linkedin_url: "linkedin_url", "linkedin url": "linkedin_url",
  empresa_linkedin: "empresa_linkedin", "company linkedin": "empresa_linkedin",
};

function detectSep(line: string): string {
  return (line.match(/;/g) || []).length > (line.match(/,/g) || []).length ? ";" : ",";
}

function parseCsvLine(line: string, sep: string): string[] {
  const out: string[] = [];
  let cur = "";
  let q = false;
  for (const c of line) {
    if (c === '"') q = !q;
    else if (c === sep && !q) { out.push(cur.trim()); cur = ""; }
    else cur += c;
  }
  out.push(cur.trim());
  return out;
}

export function parseLeadsCSV(text: string): { rows: ParsedLeadRow[]; errors: { row: number; message: string }[] } {
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  const errors: { row: number; message: string }[] = [];
  if (lines.length < 2) return { rows: [], errors: [{ row: 0, message: "Arquivo vazio ou sem dados" }] };

  const sep = detectSep(lines[0]);
  const headers = parseCsvLine(lines[0], sep).map(h => h.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim());
  const mapped = headers.map(h => LEAD_COLUMN_MAP[h] ?? null);

  const rows: ParsedLeadRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = parseCsvLine(lines[i], sep);
    const row: ParsedLeadRow = {};
    mapped.forEach((key, idx) => {
      if (key && cells[idx]) (row as any)[key] = cells[idx];
    });
    if (!row.nome && !row.email && !row.empresa_nome) {
      errors.push({ row: i + 1, message: "Linha sem nome, email ou empresa" });
      continue;
    }
    rows.push(row);
  }
  return { rows, errors };
}

export function useImportLeadsCSV() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ rows, sourceId, empresaId }: { rows: ParsedLeadRow[]; sourceId: string; empresaId: string }) => {
      if (!rows.length) throw new Error("Nenhum lead para importar");

      // Dedup by email within file
      const seen = new Set<string>();
      const cleaned = rows.filter(r => {
        const key = (r.email || "").toLowerCase().trim();
        if (!key) return true;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });

      const payload = cleaned.map(r => ({
        empresa_id: empresaId,
        search_id: null as string | null,
        nome: r.nome || null,
        email: r.email?.toLowerCase().trim() || null,
        telefone: r.telefone || null,
        cargo: r.cargo || null,
        empresa_nome: r.empresa_nome || null,
        cidade: r.cidade || null,
        estado: r.estado || null,
        pais: r.pais || null,
        linkedin_url: r.linkedin_url || null,
        empresa_linkedin: r.empresa_linkedin || null,
        status: "novo",
        enrichment_status: "pendente",
        dados_raw: { source_id: sourceId, imported_at: new Date().toISOString() },
      }));

      // Insert in batches of 500
      let inserted = 0;
      const errors: string[] = [];
      for (let i = 0; i < payload.length; i += 500) {
        const batch = payload.slice(i, i + 500);
        const { error, count } = await supabase.from("orbit_leads").insert(batch, { count: "exact" });
        if (error) {
          errors.push(error.message);
        } else {
          inserted += count ?? batch.length;
        }
      }

      return { inserted, skipped: rows.length - cleaned.length, errors };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["leads"] });
      queryClient.invalidateQueries({ queryKey: ["lead-finder-stats"] });
    },
  });
}
