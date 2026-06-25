import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/contexts/TenantContext";
import { useOrbitTasks, OrbitTaskFilters } from "./useOrbitTasks";

/**
 * Busca reuniões ativas de orbit_meetings e mapeia para a forma de "task"
 * para renderizar lado-a-lado no Kanban/Lista/Agenda da página Tarefas & Agenda.
 *
 * Itens retornados carregam:
 *   _kind: "meeting"
 *   tipo_tarefa: "meeting"     (usado pelo ícone do OrbitTaskCard → 📅)
 *   status, due_date, due_time derivados de scheduled_at
 */
export function useOrbitMeetingsAsTasks() {
  const { empresaId } = useTenant();
  return useQuery({
    queryKey: ["orbit_meetings_as_tasks", empresaId],
    enabled: !!empresaId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orbit_meetings" as any)
        .select("*, prospect:orbit_prospects(id, nome_razao)")
        .eq("empresa_id", empresaId!)
        .in("status", ["scheduled", "rescheduled"])
        .order("scheduled_at", { ascending: true });
      if (error) throw error;

      return (data || []).map((m: any) => {
        const dt = new Date(m.scheduled_at);
        const pad = (n: number) => String(n).padStart(2, "0");
        const due_date = `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
        const due_time = `${pad(dt.getHours())}:${pad(dt.getMinutes())}:00`;
        return {
          id: `meeting:${m.id}`,
          _kind: "meeting",
          meeting_id: m.id,
          empresa_id: m.empresa_id,
          prospect_id: m.prospect_id,
          deal_id: m.deal_id,
          titulo: m.titulo || "Reunião",
          descricao: m.descricao || m.meeting_url || m.location || "",
          tipo_tarefa: "meeting",
          prioridade: "high",
          status: "pending",
          due_date,
          due_time,
          scheduled_at: m.scheduled_at,
          meeting_url: m.meeting_url,
          prospect: m.prospect,
          assignee: null,
          created_at: m.created_at,
        };
      });
    },
  });
}

/**
 * Painel unificado: orbit_tasks + orbit_meetings, ordenados por due_date/due_time.
 */
export function useOrbitTasksAndMeetings(filters?: OrbitTaskFilters) {
  const tasksQ = useOrbitTasks(filters);
  const meetingsQ = useOrbitMeetingsAsTasks();

  const combined = [...(tasksQ.data || []), ...(meetingsQ.data || [])].sort(
    (a: any, b: any) => {
      const da = a.due_date ? `${a.due_date} ${a.due_time || "00:00:00"}` : "";
      const db = b.due_date ? `${b.due_date} ${b.due_time || "00:00:00"}` : "";
      if (!da) return 1;
      if (!db) return -1;
      return da.localeCompare(db);
    },
  );

  return {
    data: combined,
    isLoading: tasksQ.isLoading || meetingsQ.isLoading,
    tasks: tasksQ.data || [],
    meetings: meetingsQ.data || [],
  };
}
