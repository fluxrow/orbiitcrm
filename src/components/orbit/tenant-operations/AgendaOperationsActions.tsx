import { useEffect, useState } from "react";
import { CalendarPlus, Settings2 } from "lucide-react";
import type { AgendaOpsRead } from "@/lib/tenant-operations-types";
import { useTenantOpsActions } from "@/hooks/useTenantOpsActions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

interface Props { agenda?: AgendaOpsRead }

export function AgendaOperationsActions({ agenda }: Props) {
  const action = useTenantOpsActions();
  const [open, setOpen] = useState(false);
  const [timezone, setTimezone] = useState("America/Sao_Paulo");
  const [pauseStart, setPauseStart] = useState("12:00");
  const [pauseEnd, setPauseEnd] = useState("13:00");
  const [duration, setDuration] = useState("60");
  const [minAdvance, setMinAdvance] = useState("60");
  const [maxHorizon, setMaxHorizon] = useState("60");
  const [exceptionDate, setExceptionDate] = useState("");
  const [reason, setReason] = useState("");
  const [isAvailable, setIsAvailable] = useState(false);

  useEffect(() => {
    if (!open || !agenda) return;
    setTimezone(agenda.timezone || "America/Sao_Paulo");
    setPauseStart((agenda.availability.break_start || "12:00").slice(0, 5));
    setPauseEnd((agenda.availability.break_end || "13:00").slice(0, 5));
    setDuration(String(agenda.meeting_duration_default_minutes || 60));
    setMinAdvance(String(agenda.booking_min_notice_minutes));
    setMaxHorizon(String(agenda.booking_max_horizon_days));
  }, [agenda, open]);

  const saveConfig = async () => {
    await action.mutateAsync({ action: "update_agenda_config", payload: {
      timezone, daily_pause_start: pauseStart, daily_pause_end: pauseEnd,
      default_meeting_duration: Number(duration), min_advance_minutes: Number(minAdvance),
      max_horizon_days: Number(maxHorizon), source: "tenant_operations_ui",
    } });
  };

  const addException = async () => {
    await action.mutateAsync({ action: "add_agenda_date_exception", payload: {
      exception_date: exceptionDate, reason, is_available: isAvailable, source: "tenant_operations_ui",
    } });
    setExceptionDate(""); setReason(""); setIsAvailable(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button size="sm" variant="outline"><Settings2 className="mr-2 h-4 w-4" />Editar parâmetros</Button></DialogTrigger>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader><DialogTitle>Parâmetros da Agenda</DialogTitle><DialogDescription>Configuração tenant-scoped da disponibilidade e das exceções manuais.</DialogDescription></DialogHeader>
        <div className="grid gap-4 py-2 sm:grid-cols-2">
          <div className="space-y-2 sm:col-span-2"><Label htmlFor="agenda-timezone">Timezone IANA</Label><Input id="agenda-timezone" value={timezone} onChange={(e) => setTimezone(e.target.value)} /></div>
          <div className="space-y-2"><Label htmlFor="pause-start">Início da pausa</Label><Input id="pause-start" type="time" value={pauseStart} onChange={(e) => setPauseStart(e.target.value)} /></div>
          <div className="space-y-2"><Label htmlFor="pause-end">Fim da pausa</Label><Input id="pause-end" type="time" value={pauseEnd} onChange={(e) => setPauseEnd(e.target.value)} /></div>
          <div className="space-y-2"><Label htmlFor="duration">Duração padrão (min)</Label><Input id="duration" type="number" min={5} max={480} value={duration} onChange={(e) => setDuration(e.target.value)} /></div>
          <div className="space-y-2"><Label htmlFor="min-advance">Antecedência mínima (min)</Label><Input id="min-advance" type="number" min={0} value={minAdvance} onChange={(e) => setMinAdvance(e.target.value)} /></div>
          <div className="space-y-2"><Label htmlFor="max-horizon">Horizonte máximo (dias)</Label><Input id="max-horizon" type="number" min={1} value={maxHorizon} onChange={(e) => setMaxHorizon(e.target.value)} /></div>
        </div>
        <DialogFooter><Button disabled={action.isPending || !agenda?.connected} onClick={saveConfig}>{action.isPending ? "Salvando..." : "Salvar parâmetros"}</Button></DialogFooter>

        <div className="border-t pt-5">
          <div className="mb-3 flex items-center gap-2"><CalendarPlus className="h-4 w-4" /><h3 className="font-medium">Exceções e bloqueios manuais</h3></div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2"><Label htmlFor="exception-date">Data</Label><Input id="exception-date" type="date" value={exceptionDate} onChange={(e) => setExceptionDate(e.target.value)} /></div>
            <div className="flex items-end gap-2 pb-2"><Switch id="exception-available" checked={isAvailable} onCheckedChange={setIsAvailable} /><Label htmlFor="exception-available">Data excepcionalmente disponível</Label></div>
            <div className="space-y-2 sm:col-span-2"><Label htmlFor="exception-reason">Motivo</Label><Input id="exception-reason" maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Feriado, evento interno, plantão..." /></div>
          </div>
          <Button className="mt-3" variant="secondary" disabled={action.isPending || !exceptionDate || !reason.trim()} onClick={addException}>{action.isPending ? "Salvando..." : "Adicionar exceção"}</Button>
          <div className="mt-4 space-y-2">
            {agenda?.exceptions.length ? agenda.exceptions.map((item) => (
              <div key={item.id} className="flex items-center justify-between rounded-md border p-3 text-sm">
                <div><p className="font-medium">{new Date(`${item.exception_date}T12:00:00`).toLocaleDateString("pt-BR")}</p><p className="text-muted-foreground">{item.reason}</p></div>
                <span className={item.is_available ? "text-emerald-600" : "text-amber-600"}>{item.is_available ? "Disponível" : "Bloqueada"}</span>
              </div>
            )) : <p className="text-sm text-muted-foreground">Nenhuma exceção futura cadastrada.</p>}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
