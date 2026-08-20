import { Bell, Bot, CalendarClock, Database, Images, MessageCircle, Pause, Play, RotateCcw, XCircle } from "lucide-react";
import { useTenantOperations } from "@/hooks/useTenantOperations";
import { useTenantOpsActions, type TenantOpsActionType } from "@/hooks/useTenantOpsActions";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { OperationsCard } from "./OperationsCard";

const number = (value: unknown) => typeof value === "number" ? value : 0;
const yesNo = (value: unknown) => value === true ? "Sim" : "Não";

interface ConfirmActionProps {
  action: TenantOpsActionType;
  label: string;
  title: string;
  description: string;
  pending: boolean;
  destructive?: boolean;
  icon: typeof Pause;
  onConfirm: (action: TenantOpsActionType) => void;
}

function ConfirmAction({ action, label, title, description, pending, destructive, icon: Icon, onConfirm }: ConfirmActionProps) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant={destructive ? "destructive" : "outline"} size="sm" disabled={pending}>
          <Icon className="mr-2 h-4 w-4" />
          {pending ? "Processando..." : label}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Voltar</AlertDialogCancel>
          <AlertDialogAction
            disabled={pending}
            className={destructive ? "bg-destructive text-destructive-foreground hover:bg-destructive/90" : undefined}
            onClick={() => onConfirm(action)}
          >
            Confirmar
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function TenantOperationsModules() {
  const agenda = useTenantOperations("agenda");
  const whatsapp = useTenantOperations("whatsapp");
  const queues = useTenantOperations("queues", { refetchInterval: 30_000 });
  const ai = useTenantOperations("ai_handoff", { refetchInterval: 30_000 });
  const media = useTenantOperations("media");
  const alerts = useTenantOperations("alerts", { refetchInterval: 60_000 });
  const action = useTenantOpsActions();

  const queueCounts = queues.data?.counts;
  const aiCounts = ai.data?.counts;
  const alertCounts = alerts.data?.counts;

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
      <OperationsCard
        title="Agenda"
        description="Conexão e janela de disponibilidade"
        icon={CalendarClock}
        status={agenda.data?.connected ? "healthy" : "attention"}
        loading={agenda.isLoading}
        error={agenda.isError}
        metrics={[
          { label: "Google conectado", value: yesNo(agenda.data?.connected) },
          { label: "Timezone", value: agenda.data?.timezone || "—" },
          { label: "Antecedência", value: `${number(agenda.data?.booking_min_notice_minutes)} min` },
          { label: "Horizonte", value: `${number(agenda.data?.booking_max_horizon_days)} dias` },
        ]}
      />
      <OperationsCard
        title="WhatsApp"
        description="Instância e política de envio"
        icon={MessageCircle}
        status={whatsapp.data?.instance_offline ? "critical" : whatsapp.data?.active ? "healthy" : "attention"}
        loading={whatsapp.isLoading}
        error={whatsapp.isError}
        metrics={[
          { label: "Instância ativa", value: yesNo(whatsapp.data?.active) },
          { label: "Envio real", value: yesNo(whatsapp.data?.real_send_enabled) },
          { label: "Fila habilitada", value: yesNo(whatsapp.data?.sending_policy?.queue_enabled) },
          { label: "Limite diário", value: whatsapp.data?.sending_policy?.daily_limit ?? "—" },
        ]}
      />
      <OperationsCard
        title="Filas"
        description="Outbox e sinais de backlog"
        icon={Database}
        status={number(queueCounts?.failed) > 0 || number(queues.data?.age_buckets?.over_24h) > 0 ? "attention" : "healthy"}
        loading={queues.isLoading}
        error={queues.isError}
        metrics={[
          { label: "Pendentes", value: number(queueCounts?.pending) },
          { label: "Processando", value: number(queueCounts?.processing) },
          { label: "Falhas", value: number(queueCounts?.failed) },
          { label: "Acima de 24h", value: number(queues.data?.age_buckets?.over_24h) },
        ]}
        actions={
          <>
            <ConfirmAction
              action="retry_failed_queues"
              label="Reprocessar falhas"
              title="Reprocessar mensagens com falha?"
              description="As mensagens em status failed voltarão para pending, com tentativas zeradas e novo processamento imediato."
              pending={action.isPending}
              icon={RotateCcw}
              onConfirm={(actionType) => action.mutate({ action: actionType, payload: { source: "tenant_operations_ui" } })}
            />
            <ConfirmAction
              action="clear_pending_queues"
              label="Cancelar pendentes"
              title="Cancelar todas as mensagens pendentes?"
              description="As mensagens pending serão marcadas como canceled. Nenhum registro será excluído fisicamente."
              pending={action.isPending}
              destructive
              icon={XCircle}
              onConfirm={(actionType) => action.mutate({ action: actionType, payload: { source: "tenant_operations_ui" } })}
            />
          </>
        }
      />
      <OperationsCard
        title="IA e handoff"
        description="Responsabilidade das conversas"
        icon={Bot}
        status={number(aiCounts?.possibly_stuck) > 0 ? "attention" : "healthy"}
        loading={ai.isLoading}
        error={ai.isError}
        metrics={[
          { label: "Com a IA", value: number(aiCounts?.ai_active) },
          { label: "Com humano", value: number(aiCounts?.human_owned) },
          { label: "Aguardando humano", value: number(aiCounts?.awaiting_human) },
          { label: "Possivelmente presas", value: number(aiCounts?.possibly_stuck) },
        ]}
        actions={
          <ConfirmAction
            action={ai.data?.automatic_mode_enabled ? "pause_tenant_ai" : "resume_tenant_ai"}
            label={ai.data?.automatic_mode_enabled ? "Pausar IA global" : "Retomar IA global"}
            title={ai.data?.automatic_mode_enabled ? "Pausar a IA deste tenant?" : "Retomar a IA deste tenant?"}
            description={ai.data?.automatic_mode_enabled
              ? "Novas respostas automáticas serão pausadas para este tenant até a retomada manual."
              : "As respostas automáticas serão reativadas para este tenant."}
            pending={action.isPending}
            icon={ai.data?.automatic_mode_enabled ? Pause : Play}
            onConfirm={(actionType) => action.mutate({ action: actionType, payload: { source: "tenant_operations_ui" } })}
          />
        }
      />
      <OperationsCard
        title="Mídias"
        description="Biblioteca e integridade de armazenamento"
        icon={Images}
        status={number(media.data?.storage_health?.legacy_public_urls_detected) > 0 ? "attention" : "healthy"}
        loading={media.isLoading}
        error={media.isError}
        metrics={[
          { label: "Ativas", value: number(media.data?.counts?.active) },
          { label: "Armazenamento", value: `${number(media.data?.total_storage_mb)} MB` },
          { label: "Falhas", value: number(media.data?.counts?.failed) },
          { label: "Vinculadas a fluxos", value: number(media.data?.counts?.referenced_by_flows) },
        ]}
      />
      <OperationsCard
        title="Alertas"
        description="Saúde e entrega de notificações"
        icon={Bell}
        status={number(alertCounts?.critical) > 0 ? "critical" : number(alertCounts?.warning) > 0 ? "attention" : "healthy"}
        loading={alerts.isLoading}
        error={alerts.isError}
        metrics={[
          { label: "Críticos", value: number(alertCounts?.critical) },
          { label: "Avisos", value: number(alertCounts?.warning) },
          { label: "Informativos", value: number(alertCounts?.informational) },
          { label: "Falhas de entrega", value: number(alertCounts?.delivery_failed) },
        ]}
      />
    </div>
  );
}
