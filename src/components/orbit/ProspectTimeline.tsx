import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  UserPlus, MessageCircle, Mail, Send, GitBranch, StickyNote, RefreshCw, Loader2,
} from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useProspectEvents } from "@/hooks/useProspectEvents";

const EVENT_ICONS: Record<string, any> = {
  lead_created: UserPlus,
  conversation_started: MessageCircle,
  email_sent: Mail,
  campaign_sent: Send,
  pipeline_added: GitBranch,
  note_added: StickyNote,
  status_changed: RefreshCw,
};

const EVENT_COLORS: Record<string, string> = {
  lead_created: "bg-[hsl(var(--channel-email))]/20 text-[hsl(var(--channel-email))]",
  conversation_started: "bg-[hsl(var(--channel-whatsapp))]/20 text-[hsl(var(--channel-whatsapp))]",
  email_sent: "bg-[hsl(var(--channel-email))]/20 text-[hsl(var(--channel-email))]",
  campaign_sent: "bg-[hsl(var(--warning))]/20 text-[hsl(var(--warning))]",
  pipeline_added: "bg-primary/20 text-primary",
  note_added: "bg-muted text-muted-foreground",
  status_changed: "bg-secondary text-secondary-foreground",
};

interface ProspectTimelineProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  prospect: any | null;
}

export function ProspectTimeline({ open, onOpenChange, prospect }: ProspectTimelineProps) {
  const { data: events, isLoading } = useProspectEvents(prospect?.id);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-[400px] sm:w-[540px] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Histórico — {prospect?.nome_razao}</SheetTitle>
        </SheetHeader>

        <div className="mt-6">
          {isLoading ? (
            <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : !events?.length ? (
            <p className="text-sm text-muted-foreground text-center py-8">Nenhum evento registrado.</p>
          ) : (
            <div className="relative pl-6">
              <div className="absolute left-2.5 top-0 bottom-0 w-px bg-border" />
              {events.map((event: any) => {
                const Icon = EVENT_ICONS[event.event_type] || StickyNote;
                const colorClass = EVENT_COLORS[event.event_type] || "bg-muted text-muted-foreground";
                return (
                  <div key={event.id} className="relative mb-6 last:mb-0">
                    <div className={`absolute -left-3.5 w-6 h-6 rounded-full flex items-center justify-center ${colorClass}`}>
                      <Icon className="w-3 h-3" />
                    </div>
                    <div className="ml-4">
                      <p className="text-sm font-medium text-foreground">{event.titulo || event.event_type}</p>
                      {event.descricao && <p className="text-xs text-muted-foreground mt-0.5">{event.descricao}</p>}
                      <p className="text-xs text-muted-foreground mt-1">
                        {format(new Date(event.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
