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
        .select("*")
        .eq("empresa_id", empresaId!)
        .in("status", ["scheduled", "rescheduled"])
        .order("scheduled_at", { ascending: true });
      if (error) throw error;

      const prospectIds = Array.from(
        new Set((data || []).map((m: any) => m.prospect_id).filter(Boolean)),
      );
      let prospectsById = new Map<string, any>();
      if (prospectIds.length > 0) {
        const { data: prospects, error: prospectsError } = await supabase
          .from("orbit_prospects" as any)
          .select("id, nome_razao, nome_fantasia")
          .eq("empresa_id", empresaId!)
          .in("id", prospectIds);
        if (prospectsError) throw prospectsError;
        prospectsById = new Map((prospects || []).map((p: any) => [p.id, p]));
      }

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
          prospect: m.prospect_id ? prospectsById.get(m.prospect_id) ?? null : null,
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

  const normalizedSearch = filters?.search?.trim().toLowerCase();
  const filteredMeetings = (meetingsQ.data || []).filter((meeting: any) => {
    if (filters?.status && filters.status !== "all" && meeting.status !== filters.status) return false;
    if (filters?.prioridade && filters.prioridade !== "all" && meeting.prioridade !== filters.prioridade) return false;
    if (filters?.prospect_id && meeting.prospect_id !== filters.prospect_id) return false;
    if (!normalizedSearch) return true;
    return [
      meeting.titulo,
      meeting.descricao,
      meeting.prospect?.nome_razao,
      meeting.prospect?.nome_fantasia,
    ]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(normalizedSearch));
  });

  const combined = [...(tasksQ.data || []), ...filteredMeetings].sort(
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
    meetings: filteredMeetings,
  };
}
