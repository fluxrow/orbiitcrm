import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/contexts/TenantContext";
import { useDebounce } from "@/hooks/useDebounce";

export type OrbitSearchKind = "conversa" | "prospect" | "deal" | "tarefa";

export interface OrbitSearchResult {
  kind: OrbitSearchKind;
  id: string;
  title: string | null;
  subtitle: string | null;
  detail: string | null;
  prospect_id: string | null;
  conversa_id: string | null;
  updated_at: string | null;
}

/** Normaliza o termo do lado do cliente (trim/minúsculas). A normalização
 *  autoritativa (acentos/telefone) acontece no servidor, dentro da RPC. */
export function normalizeSearchTerm(term: string): string {
  return (term ?? "").trim().toLowerCase();
}

export function isSearchable(term: string): boolean {
  return normalizeSearchTerm(term).length >= 2;
}

/**
 * Busca global server-side, isolada por tenant via RLS (RPC SECURITY INVOKER).
 * Nunca filtra apenas a página já carregada em memória.
 */
export function useOrbitSearch(term: string, kinds?: OrbitSearchKind[], limit = 20) {
  const { empresaId } = useTenant();
  const debounced = useDebounce(term, 300);
  const normalized = normalizeSearchTerm(debounced);

  const query = useQuery({
    queryKey: ["orbit_global_search", empresaId, normalized, limit],
    enabled: !!empresaId && isSearchable(normalized),
    queryFn: async (): Promise<OrbitSearchResult[]> => {
      const { data, error } = await supabase.rpc("orbit_global_search", {
        _empresa_id: empresaId!,
        _term: debounced,
        _limit: limit,
      });
      if (error) throw error;
      return (data ?? []) as OrbitSearchResult[];
    },
    staleTime: 15_000,
  });

  const results = (query.data ?? []).filter((r) => !kinds || kinds.includes(r.kind));

  return { ...query, results, active: isSearchable(normalized) };
}
