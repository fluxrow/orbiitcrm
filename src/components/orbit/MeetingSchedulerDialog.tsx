import { useEffect, useState } from "react";
import { Calendar as CalendarIcon, Video, Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { useScheduleMeeting } from "@/hooks/useScheduleMeeting";
import { useTenant } from "@/contexts/TenantContext";

interface MeetingSchedulerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dealId?: string | null;
  prospectId?: string | null;
  defaultTitle?: string;
}

const BRAND = "#f9b217";

function defaultDateTime() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(10, 0, 0, 0);
  return {
    date: d.toISOString().slice(0, 10),
    time: "10:00",
  };
}

export function MeetingSchedulerDialog({
  open,
  onOpenChange,
  dealId,
  prospectId,
  defaultTitle,
}: MeetingSchedulerDialogProps) {
  const { empresaId } = useTenant();
  const schedule = useScheduleMeeting();
  const initial = defaultDateTime();
  const [titulo, setTitulo] = useState(defaultTitle ?? "Reunião de descoberta");
  const [date, setDate] = useState(initial.date);
  const [time, setTime] = useState(initial.time);
  const [duration, setDuration] = useState(60);
  const [meetingUrl, setMeetingUrl] = useState("");

  useEffect(() => {
    if (open) {
      const d = defaultDateTime();
      setTitulo(defaultTitle ?? "Reunião de descoberta");
      setDate(d.date);
      setTime(d.time);
      setDuration(60);
      setMeetingUrl("");
    }
  }, [open, defaultTitle]);

  const handleSubmit = async () => {
    if (!empresaId) {
      toast.error("Empresa não identificada");
      return;
    }
    if (!date || !time) {
      toast.error("Selecione data e hora");
      return;
    }
    const iso = new Date(`${date}T${time}:00`).toISOString();
    if (new Date(iso).getTime() < Date.now() - 60_000) {
      toast.error("Não é possível agendar no passado");
      return;
    }
    try {
      await schedule.mutateAsync({
        empresa_id: empresaId,
        deal_id: dealId ?? null,
        prospect_id: prospectId ?? null,
        titulo: titulo || null,
        scheduled_at: iso,
        duration_minutes: duration,
        meeting_url: meetingUrl || null,
      });
      toast.success("Reunião agendada! Lembretes automáticos ativos.");
      onOpenChange(false);
    } catch (e: any) {
      toast.error(`Erro ao agendar: ${e?.message ?? "desconhecido"}`);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarIcon className="h-5 w-5" style={{ color: BRAND }} />
            Agendar Reunião
          </DialogTitle>
          <DialogDescription>
            Lembretes automáticos de 24h e 1h serão disparados via Motor de Fluxos.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="meet-titulo">Título</Label>
            <Input
              id="meet-titulo"
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              placeholder="Reunião de descoberta"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="meet-date">Data</Label>
              <Input
                id="meet-date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="meet-time">Hora</Label>
              <Input
                id="meet-time"
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="meet-duration">Duração (minutos)</Label>
            <Input
              id="meet-duration"
              type="number"
              min={15}
              step={15}
              value={duration}
              onChange={(e) => setDuration(parseInt(e.target.value, 10) || 60)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="meet-url" className="flex items-center gap-1.5">
              <Video className="h-3.5 w-3.5" style={{ color: BRAND }} />
              Link da Reunião (Zoom / Meet)
            </Label>
            <Input
              id="meet-url"
              type="url"
              value={meetingUrl}
              onChange={(e) => setMeetingUrl(e.target.value)}
              placeholder="https://meet.google.com/..."
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={schedule.isPending}>
            Cancelar
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={schedule.isPending}
            style={{ backgroundColor: BRAND, color: "#1a1100" }}
            className="hover:opacity-90 font-semibold"
          >
            {schedule.isPending ? (
              <>
                <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                Agendando...
              </>
            ) : (
              <>
                <CalendarIcon className="h-4 w-4 mr-1.5" />
                Confirmar Agendamento
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
