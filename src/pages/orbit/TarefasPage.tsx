import { useState } from "react";
import { OrbitLayout } from "@/components/orbit/OrbitLayout";
import { PageHeader } from "@/components/orbit/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Search, Kanban, List, Calendar as CalendarIcon, CalendarClock, Link2, RefreshCw } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

import { useOrbitTasks, useCompleteOrbitTask, useUpdateOrbitTask } from "@/hooks/useOrbitTasks";
import { useOrbitTasksAndMeetings } from "@/hooks/useOrbitTasksAndMeetings";
import { OrbitTaskKanban } from "@/components/orbit/OrbitTaskKanban";
import { OrbitTaskCard } from "@/components/orbit/OrbitTaskCard";
import { OrbitTaskDialog } from "@/components/orbit/OrbitTaskDialog";
import { UnifiedCalendar } from "@/components/orbit/UnifiedCalendar";
import { ScheduleMeetingDialog } from "@/components/orbit/ScheduleMeetingDialog";
import { format, startOfMonth, endOfMonth, addDays, nextFriday } from "date-fns";
import { useNavigate } from "react-router-dom";
import { useTenant } from "@/contexts/TenantContext";
import { useGoogleCalendarStatus, useCalendarEventsRange } from "@/hooks/useOrbitGoogleCalendar";

export default function TarefasPage() {
  const { basePath, empresaId } = useTenant();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [prioridadeFilter, setPrioridadeFilter] = useState("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<any>(null);
  const [calendarMonth, setCalendarMonth] = useState(new Date());
  const [eventDialogOpen, setEventDialogOpen] = useState(false);
  const [syncIntervalMin, setSyncIntervalMin] = useState<number>(() => {
    const v = Number(localStorage.getItem("orbit:calendar:syncIntervalMin"));
    return Number.isFinite(v) && v >= 0 ? v : 15;
  });
  const handleSyncIntervalChange = (v: string) => {
    const n = Number(v);
    setSyncIntervalMin(n);
    localStorage.setItem("orbit:calendar:syncIntervalMin", String(n));
  };


  const { data: tasks, isLoading } = useOrbitTasksAndMeetings({
    search: search || undefined,
    status: statusFilter !== "all" ? statusFilter : undefined,
    prioridade: prioridadeFilter !== "all" ? prioridadeFilter : undefined,
  });
  const completeTask = useCompleteOrbitTask();
  const updateTask = useUpdateOrbitTask();

  // Google Calendar
  const { data: gStatus } = useGoogleCalendarStatus(empresaId);
  const googleConnected = !!gStatus?.connected;
  const rangeStart = startOfMonth(calendarMonth).toISOString();
  const rangeEnd = endOfMonth(calendarMonth).toISOString();
  const { data: gEvents, isFetching: gFetching, dataUpdatedAt: gUpdatedAt } = useCalendarEventsRange(
    empresaId,
    rangeStart,
    rangeEnd,
    googleConnected,
    syncIntervalMin > 0 ? syncIntervalMin * 60_000 : false,
  );

  const handleManualSync = () => {
    queryClient.invalidateQueries({ queryKey: ["google-calendar-range"] });
    queryClient.invalidateQueries({ queryKey: ["google-calendar-upcoming"] });
  };


  const handleComplete = (task: any) => {
    if (task._kind === "meeting") return; // reuniões não usam complete; gerencie no Deal
    completeTask.mutate({ id: task.id, prospect_id: task.prospect_id, empresa_id: task.empresa_id });
  };

  const handleEdit = (task: any) => {
    if (task._kind === "meeting") return; // edição de reunião acontece no Deal/Prospect
    setEditingTask(task);
    setDialogOpen(true);
  };

  const handleOpenProspect = (_prospectId: string) => {
    navigate(`${basePath}/prospects`);
  };

  const handleNewTask = () => {
    setEditingTask(null);
    setDialogOpen(true);
  };

  const handleMoveTask = (taskId: string, targetColumn: string) => {
    if (taskId.startsWith("meeting:")) return;
    if (targetColumn === "overdue") return;
    const task = (tasks || []).find((t) => t.id === taskId);
    if (!task) return;

    if (targetColumn === "completed") {
      handleComplete(task);
      return;
    }

    const today = new Date();
    let newDate: string;
    if (targetColumn === "today") {
      newDate = format(today, "yyyy-MM-dd");
    } else if (targetColumn === "tomorrow") {
      newDate = format(addDays(today, 1), "yyyy-MM-dd");
    } else {
      newDate = format(nextFriday(today), "yyyy-MM-dd");
    }

    updateTask.mutate({ id: taskId, due_date: newDate });
  };

  return (
    <OrbitLayout>
      <PageHeader title="Tarefas & Agenda" description="Gerencie atividades, follow-ups e a agenda do Google" />

      {/* Top bar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 mb-6">
        <div className="relative flex-1 w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Buscar tarefas..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[140px]"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="pending">Pendente</SelectItem>
            <SelectItem value="in_progress">Em andamento</SelectItem>
            <SelectItem value="completed">Concluída</SelectItem>
          </SelectContent>
        </Select>
        <Select value={prioridadeFilter} onValueChange={setPrioridadeFilter}>
          <SelectTrigger className="w-[140px]"><SelectValue placeholder="Prioridade" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas</SelectItem>
            <SelectItem value="high">Alta</SelectItem>
            <SelectItem value="medium">Média</SelectItem>
            <SelectItem value="low">Baixa</SelectItem>
          </SelectContent>
        </Select>
        <Button onClick={handleNewTask} className="gap-2">
          <Plus className="w-4 h-4" /> Nova Tarefa
        </Button>
        {empresaId && (
          <Button
            variant="outline"
            onClick={() => setEventDialogOpen(true)}
            className="gap-2"
            disabled={!googleConnected}
            title={googleConnected ? "Criar evento no Google Calendar" : "Conecte o Google Calendar em Configurações → Agenda"}
          >
            <CalendarClock className="w-4 h-4" /> Novo Evento
          </Button>
        )}
      </div>

      {/* Views */}
      <Tabs defaultValue="kanban">
        <TabsList className="mb-4">
          <TabsTrigger value="kanban" className="gap-1"><Kanban className="w-4 h-4" /> Quadro de Tarefas</TabsTrigger>
          <TabsTrigger value="list" className="gap-1"><List className="w-4 h-4" /> Lista</TabsTrigger>
          <TabsTrigger value="calendar" className="gap-1"><CalendarIcon className="w-4 h-4" /> Agenda</TabsTrigger>
        </TabsList>

        <TabsContent value="kanban">
          {isLoading ? (
            <p className="text-muted-foreground text-center py-12">Carregando...</p>
          ) : (
            <OrbitTaskKanban
              tasks={tasks || []}
              onComplete={handleComplete}
              onEdit={handleEdit}
              onOpenProspect={handleOpenProspect}
              onMoveTask={handleMoveTask}
            />
          )}
        </TabsContent>

        <TabsContent value="list">
          {isLoading ? (
            <p className="text-muted-foreground text-center py-12">Carregando...</p>
          ) : (
            <div className="grid gap-2 max-w-2xl">
              {(tasks || []).length === 0 ? (
                <p className="text-muted-foreground text-center py-12">Nenhuma tarefa encontrada</p>
              ) : (
                (tasks || []).map((task) => (
                  <OrbitTaskCard key={task.id} task={task} onComplete={handleComplete} onEdit={handleEdit} onOpenProspect={handleOpenProspect} />
                ))
              )}
            </div>
          )}
        </TabsContent>

        <TabsContent value="calendar">
          {!googleConnected && (
            <div className="mb-4 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 flex items-center justify-between gap-3">
              <div className="text-sm">
                <span className="font-medium">Conecte sua agenda do Google</span>
                <span className="text-muted-foreground"> para ver seus compromissos e reuniões agendadas pela IA aqui.</span>
              </div>
              <Button size="sm" variant="outline" className="gap-2" onClick={() => navigate(`${basePath}/config?tab=agenda`)}>
                <Link2 className="w-3.5 h-3.5" /> Conectar
              </Button>
            </div>
          )}
          {googleConnected && (
            <div className="mb-3 flex flex-wrap items-center justify-end gap-2 text-xs text-muted-foreground">
              <span>Sincronização automática:</span>
              <Select value={String(syncIntervalMin)} onValueChange={handleSyncIntervalChange}>
                <SelectTrigger className="h-8 w-[150px] text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="0">Desativada</SelectItem>
                  <SelectItem value="5">A cada 5 min</SelectItem>
                  <SelectItem value="15">A cada 15 min</SelectItem>
                  <SelectItem value="30">A cada 30 min</SelectItem>
                  <SelectItem value="60">A cada 1 hora</SelectItem>
                </SelectContent>
              </Select>
              {gUpdatedAt > 0 && (
                <span className="hidden sm:inline">
                  Atualizado {format(new Date(gUpdatedAt), "HH:mm:ss")}
                </span>
              )}
              <Button size="sm" variant="outline" className="h-8 gap-1.5" onClick={handleManualSync} disabled={gFetching}>
                <RefreshCw className={`w-3.5 h-3.5 ${gFetching ? "animate-spin" : ""}`} /> Sincronizar
              </Button>
            </div>
          )}
          <UnifiedCalendar
            tasks={(tasks || []) as any}
            googleEvents={gEvents || []}
            googleEnabled={googleConnected}
            googleLoading={gFetching}
            monthDate={calendarMonth}
            onMonthChange={setCalendarMonth}
            onTaskClick={handleEdit}
          />

        </TabsContent>
      </Tabs>

      <OrbitTaskDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        task={editingTask}
      />

      {empresaId && (
        <ScheduleMeetingDialog
          open={eventDialogOpen}
          onOpenChange={setEventDialogOpen}
          prospect={null}
          empresaId={empresaId}
        />
      )}
    </OrbitLayout>
  );
}
