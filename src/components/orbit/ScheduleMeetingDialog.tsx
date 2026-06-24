import { useEffect, useMemo, useState } from "react";
import { CalendarClock, CheckCircle2, AlertTriangle, Loader2, Video } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { format } from "date-fns";
import { useGoogleCalendarStatus } from "@/hooks/useOrbitGoogleCalendar";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  prospect: any | null;
  empresaId: string;
}

type AvailState =
  | { kind: "idle" }
  | { kind: "checking" }
  | { kind: "free" }
  | { kind: "busy"; ranges: { start: string; end: string }[] }
  | { kind: "error"; message: string };

const DURATIONS = [15, 30, 45, 60, 90];

function toLocalIso(date: string, time: string): string {
  // date: yyyy-MM-dd, time: HH:mm — interpret as local; build ISO with offset
  const d = new Date(`${date}T${time}:00`);
  return d.toISOString();
}

function addMinutesIso(iso: string, mins: number): string {
  return new Date(new Date(iso).getTime() + mins * 60_000).toISOString();
}

export function ScheduleMeetingDialog({ open, onOpenChange, prospect, empresaId }: Props) {
  const { data: status } = useGoogleCalendarStatus(empresaId);

  const today = useMemo(() => format(new Date(), "yyyy-MM-dd"), []);
  const [date, setDate] = useState(today);
  const [time, setTime] = useState("10:00");
  const [duration, setDuration] = useState(30);
  const [summary, setSummary] = useState("");
  const [description, setDescription] = useState("");
  const [location, setLocation] = useState("");
  const [addMeet, setAddMeet] = useState(true);
  const [inviteProspect, setInviteProspect] = useState(true);
  const [avail, setAvail] = useState<AvailState>({ kind: "idle" });
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (!open || !prospect) return;
    setSummary(`Reunião — ${prospect.nome_razao ?? "Prospect"}`);
    setDescription(prospect.nome_fantasia ? `Empresa: ${prospect.nome_fantasia}` : "");
    setLocation("");
    setAvail({ kind: "idle" });
  }, [open, prospect]);

  const startIso = useMemo(() => {
    try { return toLocalIso(date, time); } catch { return ""; }
  }, [date, time]);
  const endIso = useMemo(() => startIso ? addMinutesIso(startIso, duration) : "", [startIso, duration]);

  const connected = !!status?.connected;
  const canSubmit = connected && !!summary && !!startIso && !!endIso && !creating;

  async function handleCheckAvailability() {
    if (!startIso || !endIso) return;
    setAvail({ kind: "checking" });
    try {
      const { data, error } = await supabase.functions.invoke("orbit-google-calendar", {
        body: {
          action: "check_availability",
          empresa_id: empresaId,
          time_min: startIso,
          time_max: endIso,
        },
      });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.error?.message ?? "Falha");
      const busy = (data.data?.busy ?? []) as { start: string; end: string }[];
      setAvail(busy.length ? { kind: "busy", ranges: busy } : { kind: "free" });
    } catch (e: any) {
      setAvail({ kind: "error", message: e.message || "Erro ao verificar" });
    }
  }

  async function handleCreate() {
    if (!startIso || !endIso) return;
    setCreating(true);
    try {
      const attendees: string[] = [];
      if (inviteProspect && prospect?.email_principal) attendees.push(prospect.email_principal);

      const { data, error } = await supabase.functions.invoke("orbit-google-calendar", {
        body: {
          action: "create_event",
          empresa_id: empresaId,
          summary,
          description,
          location,
          start: startIso,
          end: endIso,
          attendees,
          add_meet: addMeet,
        },
      });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.error?.message ?? "Falha ao criar evento");

      const link = data.data?.event?.hangoutLink || data.data?.event?.htmlLink;
      toast.success("Evento criado no Google Calendar", {
        action: link ? { label: "Abrir", onClick: () => window.open(link, "_blank") } : undefined,
      });
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e.message || "Erro ao criar evento");
    } finally {
      setCreating(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarClock className="w-5 h-5 text-primary" />
            Agendar reunião
          </DialogTitle>
          <DialogDescription>
            {prospect?.nome_razao ? `Com ${prospect.nome_razao}` : "Crie um evento no Google Calendar"}
            {status?.timezone ? ` · ${status.timezone}` : ""}
          </DialogDescription>
        </DialogHeader>

        {!connected && (
          <div className="rounded-md border border-warning/40 bg-warning/10 p-3 text-sm flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 mt-0.5 text-warning shrink-0" />
            <div>
              Google Calendar não está conectado. Vá em <strong>Configurações → Agenda</strong> para conectar.
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="sched-date">Data</Label>
            <Input id="sched-date" type="date" min={today} value={date} onChange={(e) => { setDate(e.target.value); setAvail({ kind: "idle" }); }} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="sched-time">Hora</Label>
            <Input id="sched-time" type="time" value={time} onChange={(e) => { setTime(e.target.value); setAvail({ kind: "idle" }); }} />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label>Duração</Label>
          <div className="flex flex-wrap gap-2">
            {DURATIONS.map((d) => (
              <Button
                key={d}
                type="button"
                size="sm"
                variant={duration === d ? "default" : "outline"}
                onClick={() => { setDuration(d); setAvail({ kind: "idle" }); }}
              >
                {d} min
              </Button>
            ))}
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="sched-summary">Título</Label>
          <Input id="sched-summary" value={summary} onChange={(e) => setSummary(e.target.value)} />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="sched-desc">Descrição</Label>
          <Textarea id="sched-desc" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="sched-loc">Local (opcional)</Label>
          <Input id="sched-loc" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Ex.: Escritório, endereço…" />
        </div>

        <div className="flex items-center justify-between rounded-md border border-border/50 px-3 py-2">
          <div className="flex items-center gap-2 text-sm">
            <Video className="w-4 h-4 text-muted-foreground" />
            Criar link do Google Meet
          </div>
          <Switch checked={addMeet} onCheckedChange={setAddMeet} />
        </div>

        {prospect?.email_principal && (
          <div className="flex items-center justify-between rounded-md border border-border/50 px-3 py-2">
            <div className="text-sm">
              Convidar <span className="text-muted-foreground">{prospect.email_principal}</span>
            </div>
            <Switch checked={inviteProspect} onCheckedChange={setInviteProspect} />
          </div>
        )}

        <div className="rounded-md border border-border/50 p-3 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Disponibilidade</span>
            <Button type="button" size="sm" variant="outline" disabled={!connected || avail.kind === "checking"} onClick={handleCheckAvailability}>
              {avail.kind === "checking" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Verificar"}
            </Button>
          </div>
          {avail.kind === "free" && (
            <Badge className="bg-success/20 text-success border-success/40">
              <CheckCircle2 className="w-3 h-3 mr-1" /> Horário livre
            </Badge>
          )}
          {avail.kind === "busy" && (
            <div className="space-y-1">
              <Badge variant="destructive"><AlertTriangle className="w-3 h-3 mr-1" />Conflito</Badge>
              <ul className="text-xs text-muted-foreground">
                {avail.ranges.map((r, i) => (
                  <li key={i}>
                    Ocupado: {format(new Date(r.start), "dd/MM HH:mm")} → {format(new Date(r.end), "HH:mm")}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {avail.kind === "error" && (
            <p className="text-xs text-destructive">{avail.message}</p>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleCreate} disabled={!canSubmit}>
            {creating ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <CalendarClock className="w-4 h-4 mr-2" />}
            Agendar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
