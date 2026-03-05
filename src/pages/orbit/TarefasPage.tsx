import { useState } from "react";
import { OrbitLayout } from "@/components/orbit/OrbitLayout";
import { PageHeader } from "@/components/orbit/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Search, Kanban, List, Calendar as CalendarIcon } from "lucide-react";
import { useOrbitTasks, useCompleteOrbitTask } from "@/hooks/useOrbitTasks";
import { OrbitTaskKanban } from "@/components/orbit/OrbitTaskKanban";
import { OrbitTaskCard } from "@/components/orbit/OrbitTaskCard";
import { OrbitTaskDialog } from "@/components/orbit/OrbitTaskDialog";
import { format, parseISO, startOfMonth, endOfMonth, eachDayOfInterval, getDay, isSameDay } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useNavigate } from "react-router-dom";
import { useTenant } from "@/contexts/TenantContext";

export default function TarefasPage() {
  const { basePath } = useTenant();
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [prioridadeFilter, setPrioridadeFilter] = useState("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<any>(null);
  const [calendarMonth, setCalendarMonth] = useState(new Date());

  const { data: tasks, isLoading } = useOrbitTasks({
    search: search || undefined,
    status: statusFilter !== "all" ? statusFilter : undefined,
    prioridade: prioridadeFilter !== "all" ? prioridadeFilter : undefined,
  });
  const completeTask = useCompleteOrbitTask();

  const handleComplete = (task: any) => {
    completeTask.mutate({ id: task.id, prospect_id: task.prospect_id, empresa_id: task.empresa_id });
  };

  const handleEdit = (task: any) => {
    setEditingTask(task);
    setDialogOpen(true);
  };

  const handleOpenProspect = (prospectId: string) => {
    navigate(`${basePath}/prospects`);
  };

  const handleNewTask = () => {
    setEditingTask(null);
    setDialogOpen(true);
  };

  // Calendar view helpers
  const monthStart = startOfMonth(calendarMonth);
  const monthEnd = endOfMonth(calendarMonth);
  const daysInMonth = eachDayOfInterval({ start: monthStart, end: monthEnd });
  const startPadding = (getDay(monthStart) + 6) % 7; // Monday start

  return (
    <OrbitLayout>
      <PageHeader title="Tarefas" description="Gerencie atividades e follow-ups" />

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
      </div>

      {/* Views */}
      <Tabs defaultValue="kanban">
        <TabsList className="mb-4">
          <TabsTrigger value="kanban" className="gap-1"><Kanban className="w-4 h-4" /> Kanban</TabsTrigger>
          <TabsTrigger value="list" className="gap-1"><List className="w-4 h-4" /> Lista</TabsTrigger>
          <TabsTrigger value="calendar" className="gap-1"><CalendarIcon className="w-4 h-4" /> Calendário</TabsTrigger>
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
          <div className="flex items-center gap-4 mb-4">
            <Button variant="outline" size="sm" onClick={() => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() - 1))}>
              ←
            </Button>
            <span className="text-sm font-medium capitalize">
              {format(calendarMonth, "MMMM yyyy", { locale: ptBR })}
            </span>
            <Button variant="outline" size="sm" onClick={() => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1))}>
              →
            </Button>
          </div>
          <div className="grid grid-cols-7 gap-px bg-border rounded-lg overflow-hidden">
            {["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"].map((d) => (
              <div key={d} className="bg-muted/50 p-2 text-xs font-medium text-center text-muted-foreground">{d}</div>
            ))}
            {Array.from({ length: startPadding }).map((_, i) => (
              <div key={`pad-${i}`} className="bg-card p-2 min-h-[80px]" />
            ))}
            {daysInMonth.map((day) => {
              const dayTasks = (tasks || []).filter((t) => t.due_date && isSameDay(parseISO(t.due_date), day));
              return (
                <div key={day.toISOString()} className="bg-card p-1.5 min-h-[80px] border-border">
                  <span className="text-xs text-muted-foreground">{format(day, "d")}</span>
                  <div className="space-y-0.5 mt-1">
                    {dayTasks.slice(0, 3).map((t) => (
                      <div
                        key={t.id}
                        className="text-[10px] truncate px-1 py-0.5 rounded bg-primary/10 text-primary cursor-pointer hover:bg-primary/20"
                        onClick={() => handleEdit(t)}
                      >
                        {t.titulo}
                      </div>
                    ))}
                    {dayTasks.length > 3 && (
                      <span className="text-[10px] text-muted-foreground px-1">+{dayTasks.length - 3}</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </TabsContent>
      </Tabs>

      <OrbitTaskDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        task={editingTask}
      />
    </OrbitLayout>
  );
}
