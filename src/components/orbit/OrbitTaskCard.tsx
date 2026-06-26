import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Check, Edit, User, Calendar, ExternalLink, Clock } from "lucide-react";
import { format, isPast, isToday } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";

interface OrbitTaskCardProps {
  task: any;
  onComplete: (task: any) => void;
  onEdit: (task: any) => void;
  onOpenProspect?: (prospectId: string) => void;
}

const priorityColors: Record<string, string> = {
  high: "bg-destructive/20 text-destructive border-destructive/30",
  medium: "bg-amber-500/20 text-amber-400 border-amber-500/30",
  low: "bg-muted text-muted-foreground border-border",
};

const priorityLabels: Record<string, string> = {
  high: "Alta",
  medium: "Média",
  low: "Baixa",
};

const tipoIcons: Record<string, string> = {
  call: "📞",
  email: "📧",
  meeting: "📅",
  follow_up: "🔄",
  task: "✅",
};

export function OrbitTaskCard({ task, onComplete, onEdit, onOpenProspect }: OrbitTaskCardProps) {
  const [isDragging, setIsDragging] = useState(false);
  const isOverdue = task.due_date && isPast(new Date(task.due_date + "T23:59:59")) && task.status !== "completed";
  const isDueToday = task.due_date && isToday(new Date(task.due_date));
  const isCompleted = task.status === "completed";

  return (
    <div
      draggable={!isCompleted}
      onDragStart={(e) => {
        e.dataTransfer.setData("taskId", task.id);
        e.dataTransfer.effectAllowed = "move";
        setIsDragging(true);
      }}
      onDragEnd={() => setIsDragging(false)}
      className={cn(
      "rounded-lg border p-4 space-y-3 transition-all hover:shadow-md cursor-grab active:cursor-grabbing w-full min-w-0 overflow-hidden",
      isDragging && "opacity-50",
      isCompleted && "opacity-60 bg-muted/30",
      isOverdue && "border-destructive/50 bg-destructive/5",
      isDueToday && !isOverdue && "border-primary/50 bg-primary/5",
      !isOverdue && !isDueToday && !isCompleted && "bg-card border-border",
      task._kind === "meeting" && "border-l-4 border-l-[#f9b217] bg-[#f9b217]/5"
    )}>
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-2 min-w-0 flex-1">
          <span className="text-sm leading-5 shrink-0">{tipoIcons[task.tipo_tarefa] || "✅"}</span>
          <h4
            className={cn(
              "text-sm font-medium leading-snug break-words [overflow-wrap:anywhere] min-w-0 flex-1",
              isCompleted && "line-through",
            )}
          >
            {task.titulo}
          </h4>
        </div>
        <Badge variant="outline" className={cn("text-[10px] shrink-0", priorityColors[task.prioridade])}>
          {priorityLabels[task.prioridade] || task.prioridade}
        </Badge>
      </div>

      {/* Prospect */}
      {task.prospect?.nome_razao && (
        <p className="text-xs text-muted-foreground break-words [overflow-wrap:anywhere]">
          👤 {task.prospect.nome_razao}
        </p>
      )}

      {/* Meta */}
      <div className="flex items-center gap-x-3 gap-y-1 flex-wrap text-xs text-muted-foreground">
        {task.due_date && (
          <span className={cn("flex items-center gap-1", isOverdue && "text-destructive font-medium")}>
            <Calendar className="w-3 h-3" />
            {format(new Date(task.due_date), "dd/MM", { locale: ptBR })}
            {task.due_time && (
              <><Clock className="w-3 h-3 ml-1" />{task.due_time.slice(0, 5)}</>
            )}
          </span>
        )}
        {task.assignee?.nome && (
          <span className="flex items-center gap-1 min-w-0 max-w-full">
            <User className="w-3 h-3 shrink-0" />
            <span className="truncate">{task.assignee.nome}</span>
          </span>
        )}
      </div>

      {/* Actions */}
      {!isCompleted && (
        <div className="flex items-center gap-1 pt-1 flex-wrap">
          <Button size="sm" variant="ghost" className="h-7 text-xs gap-1" onClick={() => onComplete(task)}>
            <Check className="w-3 h-3" /> Concluir
          </Button>
          <Button size="sm" variant="ghost" className="h-7 text-xs gap-1" onClick={() => onEdit(task)}>
            <Edit className="w-3 h-3" /> Editar
          </Button>
          {task.prospect_id && onOpenProspect && (
            <Button size="sm" variant="ghost" className="h-7 text-xs gap-1" onClick={() => onOpenProspect(task.prospect_id)}>
              <ExternalLink className="w-3 h-3" /> Prospect
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
