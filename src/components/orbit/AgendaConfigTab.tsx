import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Loader2, Calendar, CheckCircle2, AlertCircle, ExternalLink, Unplug, Save } from "lucide-react";
import { toast } from "sonner";
import {
  useGoogleCalendarStatus,
  useConnectGoogleCalendar,
  useDisconnectGoogleCalendar,
  useUpdateGoogleCalendarConfig,
} from "@/hooks/useOrbitGoogleCalendar";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

const TIMEZONES = [
  "America/Sao_Paulo",
  "America/Manaus",
  "America/Recife",
  "America/Fortaleza",
  "America/Rio_Branco",
  "America/Belem",
  "America/Cuiaba",
];

interface Props { empresaId: string }

export default function AgendaConfigTab({ empresaId }: Props) {
  const [params, setParams] = useSearchParams();
  const status = useGoogleCalendarStatus(empresaId);
  const connect = useConnectGoogleCalendar();
  const disconnect = useDisconnectGoogleCalendar();
  const update = useUpdateGoogleCalendarConfig();

  const connected = !!status.data?.connected;

  const [calendarId, setCalendarId] = useState("primary");
  const [timezone, setTimezone] = useState("America/Sao_Paulo");

  useEffect(() => {
    if (status.data) {
      setCalendarId(status.data.calendar_id ?? "primary");
      setTimezone(status.data.timezone ?? "America/Sao_Paulo");
    }
  }, [status.data]);

  // Mostrar toast quando callback voltar com ?google=ok|error
  useEffect(() => {
    const r = params.get("google");
    if (r === "ok") { toast.success("Google Calendar conectado!"); status.refetch(); }
    if (r === "error") toast.error(`Erro ao conectar: ${params.get("reason") || ""}`);
    if (r) {
      const next = new URLSearchParams(params);
      next.delete("google"); next.delete("reason");
      setParams(next, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleConnect = async () => {
    const res = await connect.mutateAsync(empresaId);
    window.location.href = res.url;
  };

  if (status.isLoading) {
    return <div className="flex items-center gap-2 text-muted-foreground p-8"><Loader2 className="animate-spin h-4 w-4" /> Carregando…</div>;
  }

  const providerOk = status.data?.provider_configured;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Calendar className="h-5 w-5 text-primary" />
              <div>
                <CardTitle>Google Calendar</CardTitle>
                <CardDescription>Conecte sua agenda do Google para a IA criar e consultar compromissos automaticamente.</CardDescription>
              </div>
            </div>
            {connected ? (
              <Badge variant="default" className="gap-1"><CheckCircle2 className="h-3 w-3" />Conectado</Badge>
            ) : (
              <Badge variant="outline" className="gap-1"><AlertCircle className="h-3 w-3" />Não conectado</Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {!providerOk && (
            <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-sm text-amber-300">
              ⚠️ As credenciais Google (GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET) ainda não foram configuradas no servidor.
              Solicite ao administrador do sistema antes de tentar conectar.
            </div>
          )}

          {connected ? (
            <>
              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <Label className="text-xs text-muted-foreground">Conta Google</Label>
                  <p className="font-medium">{status.data?.google_email ?? "—"}</p>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Conectado em</Label>
                  <p className="font-medium">
                    {status.data?.connected_at
                      ? format(new Date(status.data.connected_at), "dd/MM/yyyy HH:mm", { locale: ptBR })
                      : "—"}
                  </p>
                </div>
              </div>

              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="cal-id">ID do calendário</Label>
                  <Input id="cal-id" value={calendarId} onChange={(e) => setCalendarId(e.target.value)} placeholder="primary" />
                  <p className="text-xs text-muted-foreground mt-1">Use "primary" para a agenda principal ou o ID de outro calendário compartilhado.</p>
                </div>
                <div>
                  <Label htmlFor="tz">Fuso horário</Label>
                  <select
                    id="tz"
                    value={timezone}
                    onChange={(e) => setTimezone(e.target.value)}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  >
                    {TIMEZONES.map((tz) => <option key={tz} value={tz}>{tz}</option>)}
                  </select>
                </div>
              </div>

              <div className="flex flex-wrap gap-2 pt-2">
                <Button
                  onClick={() => update.mutate({ empresaId, calendar_id: calendarId, timezone })}
                  disabled={update.isPending}
                  className="gap-2"
                >
                  {update.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  Salvar configurações
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    if (confirm("Desconectar o Google Calendar desta empresa?")) disconnect.mutate(empresaId);
                  }}
                  disabled={disconnect.isPending}
                  className="gap-2"
                >
                  {disconnect.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Unplug className="h-4 w-4" />}
                  Desconectar
                </Button>
              </div>
            </>
          ) : (
            <Button onClick={handleConnect} disabled={connect.isPending || !providerOk} className="gap-2">
              {connect.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ExternalLink className="h-4 w-4" />}
              Conectar com Google
            </Button>
          )}
        </CardContent>
      </Card>

      {connected && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Próximos eventos</CardTitle>
            <CardDescription>Visualização rápida da agenda conectada.</CardDescription>
          </CardHeader>
          <CardContent>
            {events.isLoading && <div className="text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin inline mr-2" />Buscando…</div>}
            {events.error && <div className="text-sm text-destructive">Erro: {(events.error as Error).message}</div>}
            {events.data && events.data.length === 0 && <p className="text-sm text-muted-foreground">Nenhum evento futuro.</p>}
            {events.data && events.data.length > 0 && (
              <ul className="space-y-2">
                {events.data.map((ev) => {
                  const start = ev.start?.dateTime || ev.start?.date;
                  return (
                    <li key={ev.id} className="flex items-start justify-between gap-3 rounded-md border border-border/50 p-3">
                      <div>
                        <p className="font-medium text-sm">{ev.summary || "(sem título)"}</p>
                        <p className="text-xs text-muted-foreground">
                          {start ? format(new Date(start), "dd/MM HH:mm", { locale: ptBR }) : "—"}
                          {ev.attendees?.length ? ` · ${ev.attendees.length} participante(s)` : ""}
                        </p>
                      </div>
                      {ev.htmlLink && (
                        <a href={ev.htmlLink} target="_blank" rel="noopener noreferrer" className="text-primary text-xs hover:underline shrink-0">
                          Abrir
                        </a>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
