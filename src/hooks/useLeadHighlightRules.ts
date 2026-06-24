import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Regras de destaque (tags) por empresa. 100% tenant-scoped — sem seeds globais.
 * Cada empresa define seus próprios gatilhos (campo, operador, valor) e a label.
 *
 * Tabela `orbit_lead_highlight_rules` será criada na migration da F3 backend.
 * Enquanto isso, o hook degrada silenciosamente para [] se a tabela não existir.
 */
export type HighlightOperator =
  | "equals"
  | "not_equals"
  | "contains"
  | "gte"
  | "lte"
  | "regex"
  | "exists";

export type LeadHighlightRule = {
  id: string;
  empresa_id: string;
  campo: string; // caminho no JSONB (ex: "faturamento_mensal")
  operador: HighlightOperator;
  valor: string | null;
  label: string;
  emoji: string | null;
  ativo: boolean;
};

export function useLeadHighlightRules(empresaId: string | null | undefined) {
  return useQuery({
    queryKey: ["lead-highlight-rules", empresaId],
    enabled: !!empresaId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orbit_lead_highlight_rules" as any)
        .select("*")
        .eq("empresa_id", empresaId!)
        .eq("ativo", true);
      if (error) {
        // Tabela ainda não criada (migration F3 backend pendente) — degrada.
        if (/relation .* does not exist/i.test(error.message)) return [] as LeadHighlightRule[];
        throw error;
      }
      return (data ?? []) as unknown as LeadHighlightRule[];
    },
  });
}

function getByPath(obj: any, path: string): unknown {
  if (!obj || !path) return undefined;
  return path.split(".").reduce<any>((acc, key) => (acc == null ? acc : acc[key]), obj);
}

export function evaluateHighlights(
  rules: LeadHighlightRule[],
  dadosAdicionais: unknown,
): LeadHighlightRule[] {
  if (!rules?.length || !dadosAdicionais) return [];
  return rules.filter((rule) => {
    const raw = getByPath(dadosAdicionais, rule.campo);
    switch (rule.operador) {
      case "exists":
        return raw != null && raw !== "";
      case "equals":
        return String(raw ?? "") === String(rule.valor ?? "");
      case "not_equals":
        return String(raw ?? "") !== String(rule.valor ?? "");
      case "contains":
        return String(raw ?? "").toLowerCase().includes(String(rule.valor ?? "").toLowerCase());
      case "gte": {
        const n = Number(raw);
        const v = Number(rule.valor);
        return !Number.isNaN(n) && !Number.isNaN(v) && n >= v;
      }
      case "lte": {
        const n = Number(raw);
        const v = Number(rule.valor);
        return !Number.isNaN(n) && !Number.isNaN(v) && n <= v;
      }
      case "regex":
        try {
          return new RegExp(rule.valor ?? "", "i").test(String(raw ?? ""));
        } catch {
          return false;
        }
      default:
        return false;
    }
  });
}
