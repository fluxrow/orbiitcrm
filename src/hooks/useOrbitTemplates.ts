import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables, TablesInsert, TablesUpdate } from "@/integrations/supabase/types";

type Template = Tables<"orbit_message_templates">;
type TemplateInsert = TablesInsert<"orbit_message_templates">;
type TemplateUpdate = TablesUpdate<"orbit_message_templates">;

interface TemplateFilters {
  canal?: string;
  categoria?: string;
  ativo?: boolean;
}

export function useOrbitTemplates(filters?: TemplateFilters) {
  return useQuery({
    queryKey: ["orbit_templates", filters],
    queryFn: async () => {
      let query = supabase
        .from("orbit_message_templates")
        .select("*")
        .order("created_at", { ascending: false });

      if (filters?.canal && filters.canal !== "all") {
        query = query.eq("canal", filters.canal);
      }

      if (filters?.categoria && filters.categoria !== "all") {
        query = query.eq("categoria", filters.categoria);
      }

      if (filters?.ativo !== undefined) {
        query = query.eq("ativo", filters.ativo);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
  });
}

export function useCreateTemplate() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (template: TemplateInsert) => {
      const { data, error } = await supabase
        .from("orbit_message_templates")
        .insert(template)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["orbit_templates"] });
    },
  });
}

export function useUpdateTemplate() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...updates }: TemplateUpdate & { id: string }) => {
      const { data, error } = await supabase
        .from("orbit_message_templates")
        .update(updates)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["orbit_templates"] });
    },
  });
}

export function useDeleteTemplate() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("orbit_message_templates")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["orbit_templates"] });
    },
  });
}
