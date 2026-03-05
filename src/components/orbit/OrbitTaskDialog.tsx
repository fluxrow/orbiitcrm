import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { CalendarIcon } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { useOrbitProspects } from "@/hooks/useOrbitProspects";
import { useCreateOrbitTask, useUpdateOrbitTask } from "@/hooks/useOrbitTasks";
import { useTenant } from "@/contexts/TenantContext";

interface OrbitTaskDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  task?: any;
  defaultProspectId?: string;
}

export function OrbitTaskDialog({ open, onOpenChange, task, defaultProspectId }: OrbitTaskDialogProps) {
  const { empresaId } = useTenant();
  const { data: prospects } = useOrbitProspects();
  const createTask = useCreateOrbitTask();
  const updateTask = useUpdateOrbitTask();

  const [titulo, setTitulo] = useState("");
  const [descricao, setDescricao] = useState("");
  const [prospectId, setProspectId] = useState("none");
  const [prioridade, setPrioridade] = useState("medium");
  const [tipoTarefa, setTipoTarefa] = useState("task");
  const [dueDate, setDueDate] = useState<Date | undefined>();
  const [dueTime, setDueTime] = useState("");
  const [notificar, setNotificar] = useState(false);

  useEffect(() => {
    if (task) {
      setTitulo(task.titulo || "");
      setDescricao(task.descricao || "");
      setProspectId(task.prospect_id || "");
      setPrioridade(task.prioridade || "medium");
      setTipoTarefa(task.tipo_tarefa || "task");
      setDueDate(task.due_date ? new Date(task.due_date) : undefined);
      setDueTime(task.due_time?.slice(0, 5) || "");
      setNotificar(task.notificar_responsavel || false);
    } else {
      setTitulo("");
      setDescricao("");
      setProspectId(defaultProspectId || "none");
      setPrioridade("medium");
      setTipoTarefa("task");
      setDueDate(undefined);
      setDueTime("");
      setNotificar(false);
    }
  }, [task, open, defaultProspectId]);

  const handleSubmit = async () => {
    if (!titulo.trim()) return;

    const payload: any = {
      titulo,
      descricao: descricao || undefined,
      prospect_id: prospectId && prospectId !== "none" ? prospectId : undefined,
      prioridade,
      tipo_tarefa: tipoTarefa,
      due_date: dueDate ? format(dueDate, "yyyy-MM-dd") : undefined,
      due_time: dueTime || undefined,
      notificar_responsavel: notificar,
    };

    if (task) {
      await updateTask.mutateAsync({ id: task.id, ...payload });
    } else {
      await createTask.mutateAsync({ ...payload, empresa_id: empresaId! });
    }
    onOpenChange(false);
  };

  const isLoading = createTask.isPending || updateTask.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{task ? "Editar Tarefa" : "Nova Tarefa"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label>Título *</Label>
            <Input value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Ex: Ligar para João" />
          </div>

          <div>
            <Label>Descrição</Label>
            <Textarea value={descricao} onChange={(e) => setDescricao(e.target.value)} placeholder="Detalhes da tarefa..." rows={3} />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Tipo</Label>
              <Select value={tipoTarefa} onValueChange={setTipoTarefa}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="call">📞 Ligação</SelectItem>
                  <SelectItem value="email">📧 Email</SelectItem>
                  <SelectItem value="meeting">📅 Reunião</SelectItem>
                  <SelectItem value="follow_up">🔄 Follow-up</SelectItem>
                  <SelectItem value="task">✅ Outro</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Prioridade</Label>
              <Select value={prioridade} onValueChange={setPrioridade}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Baixa</SelectItem>
                  <SelectItem value="medium">Média</SelectItem>
                  <SelectItem value="high">Alta</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label>Prospect</Label>
            <Select value={prospectId} onValueChange={setProspectId}>
              <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Nenhum</SelectItem>
                {(prospects || []).slice(0, 100).map((p: any) => (
                  <SelectItem key={p.id} value={p.id}>{p.nome_razao}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Data limite</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !dueDate && "text-muted-foreground")}>
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {dueDate ? format(dueDate, "dd/MM/yyyy", { locale: ptBR }) : "Selecionar"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={dueDate} onSelect={setDueDate} initialFocus className="p-3 pointer-events-auto" />
                </PopoverContent>
              </Popover>
            </div>

            <div>
              <Label>Hora</Label>
              <Input type="time" value={dueTime} onChange={(e) => setDueTime(e.target.value)} />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Checkbox id="notificar" checked={notificar} onCheckedChange={(v) => setNotificar(v === true)} />
            <Label htmlFor="notificar" className="cursor-pointer">Notificar responsável</Label>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button onClick={handleSubmit} disabled={isLoading || !titulo.trim()}>
              {isLoading ? "Salvando..." : task ? "Salvar" : "Criar Tarefa"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
