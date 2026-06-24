import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ExternalLink, Video, Users, MapPin, Calendar, Sparkles } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  event: any | null;
}

export function CalendarEventDetailSheet({ open, onOpenChange, event }: Props) {
  if (!event) return null;
  const start = event.start?.dateTime || event.start?.date;
  const end = event.end?.dateTime || event.end?.date;
  const isAI = event.extendedProperties?.private?.source === "orbit-ai";
  const meetLink = event.hangoutLink;
  const htmlLink = event.htmlLink;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-md">
        <SheetHeader>
          <div className="flex items-start gap-2">
            <Calendar className="w-5 h-5 text-primary mt-0.5 shrink-0" />
            <div className="flex-1 min-w-0">
              <SheetTitle className="text-left">{event.summary || "(sem título)"}</SheetTitle>
              <SheetDescription className="text-left">
                {start ? format(new Date(start), "EEEE, dd 'de' MMMM · HH:mm", { locale: ptBR }) : "—"}
                {end ? ` → ${format(new Date(end), "HH:mm")}` : ""}
              </SheetDescription>
            </div>
          </div>
          <div className="flex gap-2 pt-2">
            {isAI && (
              <Badge className="bg-purple-500/15 text-purple-300 border-purple-500/40 gap-1">
                <Sparkles className="w-3 h-3" /> Agendado pela IA
              </Badge>
            )}
            {event.status && <Badge variant="outline">{event.status}</Badge>}
          </div>
        </SheetHeader>

        <div className="mt-6 space-y-4 text-sm">
          {event.location && (
            <div className="flex gap-2">
              <MapPin className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
              <span>{event.location}</span>
            </div>
          )}
          {event.description && (
            <div className="rounded-md bg-muted/30 p-3 whitespace-pre-wrap text-sm">
              {event.description}
            </div>
          )}
          {event.attendees?.length > 0 && (
            <div>
              <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground mb-2">
                <Users className="w-3.5 h-3.5" /> Participantes ({event.attendees.length})
              </div>
              <ul className="space-y-1">
                {event.attendees.map((a: any, i: number) => (
                  <li key={i} className="flex justify-between items-center rounded-md border border-border/50 px-2 py-1.5">
                    <span className="truncate">{a.displayName || a.email}</span>
                    <Badge variant="outline" className="text-[10px]">{a.responseStatus || "—"}</Badge>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex flex-col gap-2 pt-4">
            {meetLink && (
              <Button asChild className="gap-2">
                <a href={meetLink} target="_blank" rel="noopener noreferrer">
                  <Video className="w-4 h-4" /> Entrar no Google Meet
                </a>
              </Button>
            )}
            {htmlLink && (
              <Button asChild variant="outline" className="gap-2">
                <a href={htmlLink} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="w-4 h-4" /> Abrir no Google Calendar
                </a>
              </Button>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
