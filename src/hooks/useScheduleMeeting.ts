import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type ScheduleMeetingInput = {
  empresa_id: string;
  deal_id?: string | null;
  prospect_id?: string | null;
  conversa_id?: string | null;
  titulo?: string | null;
  scheduled_at: string; // ISO
  duration_minutes?: number;
  meeting_url?: string | null;
  location?: string | null;
  descricao?: string | null;
};

export function useScheduleMeeting() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: ScheduleMeetingInput) => {
      const { data, error } = await (supabase.from("orbit_meetings" as any) as any)
        .insert({
          empresa_id: input.empresa_id,
          deal_id: input.deal_id ?? null,
          prospect_id: input.prospect_id ?? null,
          conversa_id: input.conversa_id ?? null,
          titulo: input.titulo ?? null,
          scheduled_at: input.scheduled_at,
          duration_minutes: input.duration_minutes ?? 60,
          meeting_url: input.meeting_url ?? null,
          location: input.location ?? null,
          descricao: input.descricao ?? null,
          status: "scheduled",
        })
        .select("id")
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["orbit-meetings"] });
      qc.invalidateQueries({ queryKey: ["orbit-deals"] });
    },
  });
}
