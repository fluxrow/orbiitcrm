import { AlertTriangle, ExternalLink } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { useZapiConnectionStatus } from "@/hooks/useZapiConnectionStatus";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

interface Props {
  /** When true, shows a compact version (no action button). */
  compact?: boolean;
}

export function ZapiConnectionAlert({ compact = false }: Props) {
  const { data, isLoading } = useZapiConnectionStatus();

  if (isLoading || !data || data.status !== "disconnected") return null;

  const since = data.last_disconnect_at
    ? formatDistanceToNow(new Date(data.last_disconnect_at), { addSuffix: true, locale: ptBR })
    : null;

  return (
    <Alert variant="destructive" className="mb-3">
      <AlertTriangle className="h-4 w-4" />
      <AlertTitle>WhatsApp desconectado</AlertTitle>
      <AlertDescription className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <span className="text-sm">
          A instância Z-API perdeu a sessão{since ? ` ${since}` : ""}. Nenhuma mensagem nova está sendo recebida nem respondida pelo agente até a reconexão.
          {data.disconnect_reason ? <span className="block opacity-80 mt-1">Motivo: {data.disconnect_reason}</span> : null}
        </span>
        {!compact && (
          <Button
            asChild
            size="sm"
            variant="outline"
            className="shrink-0 bg-background text-foreground"
          >
            <a href="https://app.z-api.io/" target="_blank" rel="noopener noreferrer">
              Reconectar no Z-API <ExternalLink className="ml-2 h-3 w-3" />
            </a>
          </Button>
        )}
      </AlertDescription>
    </Alert>
  );
}
