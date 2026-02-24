import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/** Returns Map<oportunidade_id, distinct product names[]> */
export function useOportunidadesProdutos(orgId: string | null) {
  return useQuery({
    queryKey: ["kanban-produtos", orgId],
    queryFn: async () => {
      if (!orgId) return new Map<string, string[]>();

      const { data, error } = await supabase
        .from("oportunidade_itens")
        .select("oportunidade_id, produto_nome_snapshot, produtos(nome)")
        .eq("organization_id", orgId);

      if (error) throw error;

      const map = new Map<string, string[]>();
      for (const item of data || []) {
        const opId = item.oportunidade_id;
        const nome = item.produto_nome_snapshot || (item.produtos as any)?.nome;
        if (!opId || !nome) continue;
        const arr = map.get(opId) || [];
        if (!arr.includes(nome)) arr.push(nome);
        map.set(opId, arr);
      }
      return map;
    },
    enabled: !!orgId,
  });
}

/** Returns Map<oportunidade_id, { titulo, due_date }> with the nearest open task */
export function useOportunidadesProximaTarefa(orgId: string | null) {
  return useQuery({
    queryKey: ["kanban-proxima-tarefa", orgId],
    queryFn: async () => {
      if (!orgId) return new Map<string, { titulo: string; due_date: string }>();

      const today = new Date().toISOString().split("T")[0];
      const { data, error } = await supabase
        .from("tarefas")
        .select("oportunidade_id, titulo, due_date")
        .eq("organization_id", orgId)
        .eq("status", "open")
        .gte("due_date", today)
        .order("due_date", { ascending: true });

      if (error) throw error;

      const map = new Map<string, { titulo: string; due_date: string }>();
      for (const t of data || []) {
        if (!t.oportunidade_id || !t.due_date) continue;
        // Keep only the first (earliest) per oportunidade
        if (!map.has(t.oportunidade_id)) {
          map.set(t.oportunidade_id, { titulo: t.titulo, due_date: t.due_date });
        }
      }
      return map;
    },
    enabled: !!orgId,
  });
}
