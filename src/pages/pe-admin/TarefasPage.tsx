import { useState, useMemo } from "react";
import { useTarefas, useMarkTarefaDone, useUpdateTarefa } from "@/hooks/useTarefas";
import { usePeAuth } from "@/hooks/usePeAuth";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { CalendarIcon, ChevronDown, ChevronRight, AlertTriangle, Clock, CalendarDays, CheckCircle2 } from "lucide-react";
import { format, parseISO, startOfDay, isBefore, isEqual } from "date-fns";

const PRIORIDADE_COLORS: Record<string, "default" | "secondary" | "destructive"> = {
  low: "secondary",
  normal: "default",
  high: "destructive",
};

const PRIORIDADE_LABELS: Record<string, string> = {
  low: "Baixa",
  normal: "Normal",
  high: "Alta",
};

export default function TarefasPage() {
  const { peUser, roleCode, isSuperAdmin } = usePeAuth();
  const isAdminOrManager = isSuperAdmin || ["ORG_ADMIN", "ORG_MANAGER"].includes(roleCode ?? "");

  const [minhasTarefas, setMinhasTarefas] = useState(!isAdminOrManager);
  const [prioridadeFilter, setPrioridadeFilter] = useState<string>("");
  const [doneOpen, setDoneOpen] = useState(false);

  const { data: tarefas, isLoading } = useTarefas({
    assigned_to_user_id: minhasTarefas && peUser?.id ? peUser.id : undefined,
    prioridade: prioridadeFilter || undefined,
  });

  const markDone = useMarkTarefaDone();
  const updateTarefa = useUpdateTarefa();

  const hoje = useMemo(() => startOfDay(new Date()), []);

  const { atrasadas, hojeTarefas, proximas, concluidas } = useMemo(() => {
    const groups = { atrasadas: [] as any[], hojeTarefas: [] as any[], proximas: [] as any[], concluidas: [] as any[] };
    for (const t of tarefas || []) {
      if (t.status === "done") {
        groups.concluidas.push(t);
      } else if (t.due_date) {
        const d = startOfDay(parseISO(t.due_date));
        if (isBefore(d, hoje)) groups.atrasadas.push(t);
        else if (isEqual(d, hoje)) groups.hojeTarefas.push(t);
        else groups.proximas.push(t);
      } else {
        groups.proximas.push(t);
      }
    }
    return groups;
  }, [tarefas, hoje]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Tarefas</h1>
        <p className="text-muted-foreground">Visão operacional das suas tarefas</p>
      </div>

      <div className="flex items-center gap-4 flex-wrap">
        <div className="flex items-center gap-2">
          <Switch id="minhas" checked={minhasTarefas} onCheckedChange={setMinhasTarefas} />
          <Label htmlFor="minhas" className="text-sm">Minhas tarefas</Label>
        </div>
        <Select value={prioridadeFilter} onValueChange={(v) => setPrioridadeFilter(v === "all" ? "" : v)}>
          <SelectTrigger className="w-[140px]"><SelectValue placeholder="Prioridade" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas</SelectItem>
            <SelectItem value="low">Baixa</SelectItem>
            <SelectItem value="normal">Normal</SelectItem>
            <SelectItem value="high">Alta</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
        </div>
      ) : (
        <div className="space-y-6">
          <TarefaSection
            title="Atrasadas"
            icon={<AlertTriangle className="w-4 h-4 text-destructive" />}
            tarefas={atrasadas}
            markDone={markDone}
            updateTarefa={updateTarefa}
            variant="overdue"
          />
          <TarefaSection
            title="Hoje"
            icon={<Clock className="w-4 h-4 text-primary" />}
            tarefas={hojeTarefas}
            markDone={markDone}
            updateTarefa={updateTarefa}
          />
          <TarefaSection
            title="Próximas"
            icon={<CalendarDays className="w-4 h-4 text-muted-foreground" />}
            tarefas={proximas}
            markDone={markDone}
            updateTarefa={updateTarefa}
          />

          {concluidas.length > 0 && (
            <Collapsible open={doneOpen} onOpenChange={setDoneOpen}>
              <CollapsibleTrigger className="flex items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-foreground transition-colors">
                {doneOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                <CheckCircle2 className="w-4 h-4" />
                Concluídas
                <Badge variant="secondary" className="text-xs">{concluidas.length}</Badge>
              </CollapsibleTrigger>
              <CollapsibleContent className="mt-3 space-y-2">
                {concluidas.map((t: any) => (
                  <TarefaCard key={t.id} tarefa={t} markDone={markDone} updateTarefa={updateTarefa} done />
                ))}
              </CollapsibleContent>
            </Collapsible>
          )}

          {(!tarefas || tarefas.length === 0) && (
            <p className="text-center py-8 text-muted-foreground">Nenhuma tarefa encontrada</p>
          )}
        </div>
      )}
    </div>
  );
}

function TarefaSection({ title, icon, tarefas, markDone, updateTarefa, variant }: {
  title: string;
  icon: React.ReactNode;
  tarefas: any[];
  markDone: any;
  updateTarefa: any;
  variant?: "overdue";
}) {
  if (tarefas.length === 0) return null;

  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        {icon}
        <h2 className={`text-sm font-semibold ${variant === "overdue" ? "text-destructive" : "text-foreground"}`}>{title}</h2>
        <Badge variant={variant === "overdue" ? "destructive" : "secondary"} className="text-xs">{tarefas.length}</Badge>
      </div>
      <div className="space-y-2">
        {tarefas.map((t: any) => (
          <TarefaCard key={t.id} tarefa={t} markDone={markDone} updateTarefa={updateTarefa} overdue={variant === "overdue"} />
        ))}
      </div>
    </div>
  );
}

function TarefaCard({ tarefa: t, markDone, updateTarefa, overdue, done }: {
  tarefa: any;
  markDone: any;
  updateTarefa: any;
  overdue?: boolean;
  done?: boolean;
}) {
  const [rescheduleOpen, setRescheduleOpen] = useState(false);
  const [prioridadeOpen, setPrioridadeOpen] = useState(false);

  const handleReschedule = (date: Date | undefined) => {
    if (!date) return;
    updateTarefa.mutate({ id: t.id, due_date: format(date, "yyyy-MM-dd") });
    setRescheduleOpen(false);
  };

  const handlePrioridade = (p: string) => {
    updateTarefa.mutate({ id: t.id, prioridade: p });
    setPrioridadeOpen(false);
  };

  return (
    <div className={`flex items-start gap-3 p-3 border rounded-lg ${overdue ? "border-destructive/40 bg-destructive/5" : ""} ${done ? "opacity-60" : ""}`}>
      <Checkbox
        checked={t.status === "done"}
        onCheckedChange={() => {
          if (t.status !== "done") markDone.mutate({ id: t.id, organization_id: t.organization_id });
        }}
        className="mt-1"
      />
      <div className="flex-1 min-w-0 space-y-1">
        <div className="flex items-center justify-between gap-2">
          <p className={`text-sm font-medium truncate ${done ? "line-through text-muted-foreground" : ""}`}>{t.titulo}</p>
          <Popover open={prioridadeOpen} onOpenChange={setPrioridadeOpen}>
            <PopoverTrigger asChild>
              <button type="button" className="shrink-0">
                <Badge variant={PRIORIDADE_COLORS[t.prioridade]} className="text-xs cursor-pointer hover:opacity-80">
                  {PRIORIDADE_LABELS[t.prioridade] || t.prioridade}
                </Badge>
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-1" align="end">
              <div className="flex flex-col gap-1">
                {["low", "normal", "high"].map((p) => (
                  <Button key={p} variant="ghost" size="sm" className="justify-start text-xs" onClick={() => handlePrioridade(p)}>
                    <Badge variant={PRIORIDADE_COLORS[p]} className="text-xs mr-2">{PRIORIDADE_LABELS[p]}</Badge>
                  </Button>
                ))}
              </div>
            </PopoverContent>
          </Popover>
        </div>

        <p className="text-xs text-muted-foreground truncate">
          {t.clientes?.razao_social || "—"}
          {t.oportunidades?.titulo ? ` › ${t.oportunidades.titulo}` : ""}
        </p>

        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          {t.due_date && (
            <span className={overdue ? "text-destructive font-medium" : ""}>
              Vence: {format(parseISO(t.due_date), "dd/MM")}
            </span>
          )}
          <span>{(t.assigned as any)?.full_name || "—"}</span>

          {!done && (
            <Popover open={rescheduleOpen} onOpenChange={setRescheduleOpen}>
              <PopoverTrigger asChild>
                <Button variant="ghost" size="sm" className="h-6 px-2 text-xs gap-1">
                  <CalendarIcon className="w-3 h-3" />Reagendar
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={t.due_date ? parseISO(t.due_date) : undefined}
                  onSelect={handleReschedule}
                  initialFocus
                  className="p-3 pointer-events-auto"
                />
              </PopoverContent>
            </Popover>
          )}
        </div>
      </div>
    </div>
  );
}
