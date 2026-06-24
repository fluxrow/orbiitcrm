import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, ChevronLeft, ChevronRight, Sparkles, CheckSquare, Calendar as CalendarIcon } from "lucide-react";
import {
  format,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  isSameDay,
  isSameMonth,
  isToday,
  parseISO,
  addMonths,
  subMonths,
} from "date-fns";
import { ptBR } from "date-fns/locale";
import { CalendarEventDetailSheet } from "./CalendarEventDetailSheet";

interface Task {
  id: string;
  titulo: string;
  due_date?: string | null;
  prioridade?: string | null;
  status?: string | null;
}

interface Props {
  tasks: Task[];
  googleEvents: any[];
  googleEnabled: boolean;
  googleLoading?: boolean;
  monthDate: Date;
  onMonthChange: (d: Date) => void;
  onTaskClick: (task: Task) => void;
}

type CalItem =
  | { type: "task"; date: Date; task: Task }
  | { type: "event"; date: Date; event: any; isAI: boolean };

export function UnifiedCalendar({
  tasks,
  googleEvents,
  googleEnabled,
  googleLoading,
  monthDate,
  onMonthChange,
  onTaskClick,
}: Props) {
  const [selectedEvent, setSelectedEvent] = useState<any | null>(null);

  const monthStart = startOfMonth(monthDate);
  const monthEnd = endOfMonth(monthDate);
  // Grid start = Monday of week containing monthStart
  const gridStart = startOfWeek(monthStart, { weekStartsOn: 1 });
  const gridEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
  const days = eachDayOfInterval({ start: gridStart, end: gridEnd });

  const itemsByDay = useMemo(() => {
    const map = new Map<string, CalItem[]>();
    const push = (d: Date, item: CalItem) => {
      const k = format(d, "yyyy-MM-dd");
      const arr = map.get(k) ?? [];
      arr.push(item);
      map.set(k, arr);
    };
    for (const t of tasks) {
      if (!t.due_date) continue;
      try {
        const d = parseISO(t.due_date);
        push(d, { type: "task", date: d, task: t });
      } catch { /* skip */ }
    }
    for (const e of googleEvents) {
      const startStr = e.start?.dateTime || e.start?.date;
      if (!startStr) continue;
      try {
        const d = new Date(startStr);
        const isAI = e.extendedProperties?.private?.source === "orbit-ai";
        push(d, { type: "event", date: d, event: e, isAI });
      } catch { /* skip */ }
    }
    return map;
  }, [tasks, googleEvents]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => onMonthChange(subMonths(monthDate, 1))}>
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <span className="text-base font-semibold capitalize min-w-[160px] text-center">
            {format(monthDate, "MMMM 'de' yyyy", { locale: ptBR })}
          </span>
          <Button variant="outline" size="icon" onClick={() => onMonthChange(addMonths(monthDate, 1))}>
            <ChevronRight className="w-4 h-4" />
          </Button>
          <Button variant="ghost" size="sm" onClick={() => onMonthChange(new Date())}>
            Hoje
          </Button>
          {googleEnabled && googleLoading && (
            <span className="text-xs text-muted-foreground inline-flex items-center gap-1">
              <Loader2 className="w-3 h-3 animate-spin" /> Sincronizando agenda…
            </span>
          )}
        </div>
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-primary/60" /> Tarefas
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-emerald-500/60" /> Google
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-purple-500/60" /> IA
          </span>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-px bg-border rounded-lg overflow-hidden border border-border">
        {["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"].map((d) => (
          <div key={d} className="bg-muted/50 px-2 py-1.5 text-[11px] font-semibold text-center text-muted-foreground uppercase">
            {d}
          </div>
        ))}
        {days.map((day) => {
          const k = format(day, "yyyy-MM-dd");
          const items = (itemsByDay.get(k) ?? []).sort((a, b) => a.date.getTime() - b.date.getTime());
          const outside = !isSameMonth(day, monthDate);
          const today = isToday(day);
          return (
            <div
              key={k}
              className={`bg-card p-1.5 min-h-[110px] flex flex-col gap-1 ${outside ? "opacity-40" : ""}`}
            >
              <div className="flex items-center justify-between">
                <span
                  className={`text-xs font-medium inline-flex items-center justify-center w-6 h-6 rounded-full ${
                    today ? "bg-primary text-primary-foreground" : "text-muted-foreground"
                  }`}
                >
                  {format(day, "d")}
                </span>
                {items.length > 0 && (
                  <span className="text-[10px] text-muted-foreground">{items.length}</span>
                )}
              </div>
              <div className="space-y-1 overflow-hidden">
                {items.slice(0, 3).map((it, i) => {
                  if (it.type === "task") {
                    return (
                      <button
                        key={`t-${it.task.id}`}
                        onClick={() => onTaskClick(it.task)}
                        className="w-full text-left text-[10.5px] truncate px-1.5 py-0.5 rounded bg-primary/15 text-primary hover:bg-primary/25 flex items-center gap-1"
                      >
                        <CheckSquare className="w-2.5 h-2.5 shrink-0" />
                        <span className="truncate">{it.task.titulo}</span>
                      </button>
                    );
                  }
                  const isAI = it.isAI;
                  return (
                    <button
                      key={`e-${it.event.id}-${i}`}
                      onClick={() => setSelectedEvent(it.event)}
                      className={`w-full text-left text-[10.5px] truncate px-1.5 py-0.5 rounded flex items-center gap-1 ${
                        isAI
                          ? "bg-purple-500/15 text-purple-300 hover:bg-purple-500/25"
                          : "bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25"
                      }`}
                    >
                      {isAI ? <Sparkles className="w-2.5 h-2.5 shrink-0" /> : <CalendarIcon className="w-2.5 h-2.5 shrink-0" />}
                      <span className="truncate">
                        {format(it.date, "HH:mm")} {it.event.summary || "(sem título)"}
                      </span>
                    </button>
                  );
                })}
                {items.length > 3 && (
                  <span className="text-[10px] text-muted-foreground px-1">+{items.length - 3} mais</span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Próximos eventos do Google (lista resumo) */}
      {googleEnabled && googleEvents.length > 0 && (
        <div className="rounded-lg border border-border/60 p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold">Próximos eventos do Google</h3>
            <Badge variant="outline" className="text-[10px]">{googleEvents.length}</Badge>
          </div>
          <ul className="space-y-1.5 max-h-64 overflow-auto">
            {googleEvents
              .filter((e) => {
                const s = e.start?.dateTime || e.start?.date;
                return s && new Date(s) >= new Date();
              })
              .slice(0, 10)
              .map((e) => {
                const s = e.start?.dateTime || e.start?.date;
                const isAI = e.extendedProperties?.private?.source === "orbit-ai";
                return (
                  <li key={e.id}>
                    <button
                      onClick={() => setSelectedEvent(e)}
                      className="w-full text-left flex items-center justify-between gap-3 rounded-md border border-border/40 px-2.5 py-2 hover:bg-muted/40"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        {isAI ? (
                          <Sparkles className="w-3.5 h-3.5 text-purple-400 shrink-0" />
                        ) : (
                          <CalendarIcon className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                        )}
                        <span className="text-sm truncate">{e.summary || "(sem título)"}</span>
                      </div>
                      <span className="text-[11px] text-muted-foreground shrink-0">
                        {s ? format(new Date(s), "dd/MM HH:mm", { locale: ptBR }) : "—"}
                      </span>
                    </button>
                  </li>
                );
              })}
          </ul>
        </div>
      )}

      <CalendarEventDetailSheet
        open={!!selectedEvent}
        onOpenChange={(v) => !v && setSelectedEvent(null)}
        event={selectedEvent}
      />
    </div>
  );
}
