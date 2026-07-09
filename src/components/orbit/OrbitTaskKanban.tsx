import { useState } from "react";
import { OrbitTaskCard } from "./OrbitTaskCard";
import { isPast, isToday, isTomorrow, isThisWeek, parseISO } from "date-fns";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { usePreventHorizontalHistorySwipe } from "@/hooks/usePreventHorizontalHistorySwipe";

interface OrbitTaskKanbanProps {
  tasks: any[];
  onComplete: (task: any) => void;
  onEdit: (task: any) => void;
  onOpenProspect?: (prospectId: string) => void;
  onMoveTask?: (taskId: string, targetColumn: string) => void;
}

function categorizeTasks(tasks: any[]) {
  const columns = {
    overdue: [] as any[],
    today: [] as any[],
    tomorrow: [] as any[],
    thisWeek: [] as any[],
    completed: [] as any[],
  };

  for (const task of tasks) {
    if (task.status === "completed") {
      columns.completed.push(task);
      continue;
    }

    if (!task.due_date) {
      columns.thisWeek.push(task);
      continue;
    }

    const d = parseISO(task.due_date);
    if (isPast(new Date(task.due_date + "T23:59:59")) && !isToday(d)) {
      columns.overdue.push(task);
    } else if (isToday(d)) {
      columns.today.push(task);
    } else if (isTomorrow(d)) {
      columns.tomorrow.push(task);
    } else if (isThisWeek(d, { weekStartsOn: 1 })) {
      columns.thisWeek.push(task);
    } else {
      columns.thisWeek.push(task);
    }
  }

  return columns;
}

const columnConfig = [
  { key: "overdue", label: "Atrasadas", color: "text-destructive" },
  { key: "today", label: "Hoje", color: "text-primary" },
  { key: "tomorrow", label: "Amanhã", color: "text-foreground" },
  { key: "thisWeek", label: "Esta Semana", color: "text-muted-foreground" },
  { key: "completed", label: "Concluídas", color: "text-muted-foreground" },
];

export function OrbitTaskKanban({ tasks, onComplete, onEdit, onOpenProspect, onMoveTask }: OrbitTaskKanbanProps) {
  const columns = categorizeTasks(tasks);
  const [dragOverColumn, setDragOverColumn] = useState<string | null>(null);
  const preventHorizontalHistorySwipe = usePreventHorizontalHistorySwipe<HTMLDivElement>();

  const handleDragOver = (e: React.DragEvent, key: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverColumn(key);
  };

  const handleDrop = (e: React.DragEvent, key: string) => {
    e.preventDefault();
    setDragOverColumn(null);
    const taskId = e.dataTransfer.getData("taskId");
    if (taskId && onMoveTask) {
      onMoveTask(taskId, key);
    }
  };

  return (
    <div
      className="flex gap-4 overflow-x-auto overscroll-x-contain pb-4 min-h-[500px]"
      style={{ overscrollBehaviorX: "contain", overscrollBehaviorY: "auto" }}
      onWheelCapture={preventHorizontalHistorySwipe}
    >
      {columnConfig.map(({ key, label, color }) => {
        const items = columns[key as keyof typeof columns];
        const isOver = dragOverColumn === key;
        return (
          <div
            key={key}
            className={cn(
              "min-w-[280px] w-[280px] flex-shrink-0 rounded-lg transition-colors",
              isOver && key !== "overdue" && "ring-2 ring-primary/50 bg-primary/5"
            )}
            onDragOver={(e) => handleDragOver(e, key)}
            onDragLeave={() => setDragOverColumn(null)}
            onDrop={(e) => handleDrop(e, key)}
          >
            <div className="flex items-center gap-2 mb-3">
              <h3 className={`text-sm font-semibold ${color}`}>{label}</h3>
              <span className="text-xs text-muted-foreground bg-muted rounded-full px-2 py-0.5">
                {items.length}
              </span>
            </div>
            <ScrollArea className="h-[calc(100vh-300px)]">
              <div className="space-y-2 pr-2">
                {items.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-8">Nenhuma tarefa</p>
                ) : (
                  items.map((task) => (
                    <OrbitTaskCard
                      key={task.id}
                      task={task}
                      onComplete={onComplete}
                      onEdit={onEdit}
                      onOpenProspect={onOpenProspect}
                    />
                  ))
                )}
              </div>
            </ScrollArea>
          </div>
        );
      })}
    </div>
  );
}
