import { useState } from "react";
import { Bell, Bot, CalendarClock, Database, GitBranch, Images, MessageCircle, Pause, Play, RotateCcw, ShieldAlert, XCircle } from "lucide-react";
import { useTenantOperations } from "@/hooks/useTenantOperations";
import { useTenantOpsActions, type TenantOpsActionType } from "@/hooks/useTenantOpsActions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { AgendaOperationsActions } from "./AgendaOperationsActions";
import { MediaOperationsManager } from "./MediaOperationsManager";
import { PromptsFlowsManager } from "./PromptsFlowsManager";

const number = (value: unknown) => typeof value === "number" ? value : 0;
const yesNo = (value: unknown) => value === true ? "Sim" : "Não";

interface ConfirmActionProps {
  action: TenantOpsActionType;
  label: string;
  title: string;
  description: string;
  pending: boolean;
  destructive?: boolean;
  disabled?: boolean;
  impactCount?: number;
  onPreview?: () => Promise<number>;
  icon: typeof Pause;
  onConfirm: (action: TenantOpsActionType, confirmation: string) => void;
}

function ConfirmAction({ action, label, title, description, pending, destructive, disabled, impactCount = 0, onPreview, icon: Icon, onConfirm }: ConfirmActionProps) {
  const [open, setOpen] = useState(false);
  const [previewCount, setPreviewCount] = useState(impactCount);
  const [confirmation, setConfirmation] = useState("");
  const requiresTypedConfirmation = previewCount > 50;

  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (!nextOpen) {
      setPreviewCount(impactCount);
      setConfirmation("");
    }
  };

  const handleTrigger = async () => {
    if (!onPreview) return;
    try {
      setPreviewCount(await onPreview());
    } catch {
      setOpen(false);
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={handleOpenChange}>
      <AlertDialogTrigger asChild>
        <Button variant={destructive ? "destructive" : "outline"} size="sm" disabled={pending || disabled} onClick={handleTrigger}>
          <Icon className="mr-2 h-4 w-4" />
          {pending ? "Processando..." : label}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-3">
              <p>{description}</p>
              {impactCount > 0 || onPreview ? <p className="font-medium text-foreground">Registros identificados: {previewCount}</p> : null}
              {requiresTypedConfirmation ? (
                <div className="space-y-2">
                  <p>Esta ação afeta mais de 50 registros. Digite <strong>CONFIRMAR</strong> para continuar.</p>
                  <Input value={confirmation} onChange={(event) => setConfirmation(event.target.value)} placeholder="CONFIRMAR" autoComplete="off" />
                </div>
              ) : null}
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Voltar</AlertDialogCancel>
          <AlertDialogAction
            disabled={pending || (requiresTypedConfirmation && confirmation !== "CONFIRMAR")}
            className={destructive ? "bg-destructive text-destructive-foreground hover:bg-destructive/90" : undefined}
            onClick={() => onConfirm(action, confirmation)}
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
  const promptsFlows = useTenantOperations("prompts_flows");
  const alerts = useTenantOperations("alerts", { refetchInterval: 60_000 });
  const action = useTenantOpsActions();

  const queueCounts = queues.data?.counts;
  const aiCounts = ai.data?.counts;
  const alertCounts = alerts.data?.counts;
  const whatsappCredentialsValid = whatsapp.data?.credentials?.valid === true;

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
        actions={<AgendaOperationsActions agenda={agenda.data} />}
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
          { label: "Envio real", value: whatsapp.data?.real_send_enabled ? "Ativo" : "Pausado" },
          { label: "Credenciais", value: whatsappCredentialsValid ? "Válidas" : "Incompletas" },
          { label: "Fila habilitada", value: yesNo(whatsapp.data?.sending_policy?.queue_enabled) },
        ]}
        actions={
          <div className="w-full space-y-2">
            <ConfirmAction
              action="toggle_whatsapp_live_send"
              label={whatsapp.data?.real_send_enabled ? "Pausar envio real" : "Ativar envio real"}
              title={whatsapp.data?.real_send_enabled ? "Pausar o envio real do WhatsApp?" : "Ativar o envio real do WhatsApp?"}
              description={whatsapp.data?.real_send_enabled
                ? "Novos envios reais serão bloqueados até uma nova ativação manual."
                : "Mensagens elegíveis poderão ser enviadas pela instância configurada deste tenant."}
              pending={action.isPending}
              disabled={!whatsapp.data?.real_send_enabled && !whatsappCredentialsValid}
              icon={whatsapp.data?.real_send_enabled ? Pause : Play}
              onConfirm={(actionType) => action.mutate({
                action: actionType,
                payload: { enabled: !whatsapp.data?.real_send_enabled, source: "tenant_operations_ui" },
              })}
            />
            {!whatsappCredentialsValid ? (
              <p className="flex items-start gap-2 text-xs text-amber-600 dark:text-amber-400">
                <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
                Ativação bloqueada: instance ID, token e client token precisam estar configurados.
              </p>
            ) : null}
          </div>
        }
      />
      <OperationsCard
        title="Filas"
        description="Outbox e sinais de backlog"
        icon={Database}
        status={queues.data?.paused || number(queueCounts?.failed) > 0 || number(queues.data?.age_buckets?.over_24h) > 0 ? "attention" : "healthy"}
        loading={queues.isLoading}
        error={queues.isError}
        metrics={[
          { label: "Pendentes", value: number(queueCounts?.pending) },
          { label: "Processando", value: number(queueCounts?.processing) },
          { label: "Falhas", value: number(queueCounts?.failed) },
          { label: "Pendentes >24h", value: number(queues.data?.age_buckets?.over_24h) },
          { label: "Consumo", value: queues.data?.paused ? "Pausado" : "Ativo" },
        ]}
        actions={
          <>
            <ConfirmAction
              action={queues.data?.paused ? "resume_queue_processing" : "pause_queue_processing"}
              label={queues.data?.paused ? "Retomar consumo" : "Pausar consumo"}
              title={queues.data?.paused ? "Retomar o consumo da fila?" : "Pausar o consumo da fila?"}
              description={queues.data?.paused
                ? "O worker poderá voltar a processar as mensagens pendentes deste tenant."
                : "As mensagens permanecerão pendentes, sem consumo, até a retomada manual."}
              pending={action.isPending}
              icon={queues.data?.paused ? Play : Pause}
              onConfirm={(actionType) => action.mutate({ action: actionType, payload: { source: "tenant_operations_ui" } })}
            />
            <ConfirmAction
              action="retry_failed_queues"
              label="Reprocessar falhas"
              title="Reprocessar mensagens com falha?"
              description="As mensagens em status failed voltarão para pending, com tentativas zeradas e novo processamento imediato."
              pending={action.isPending}
              impactCount={number(queueCounts?.failed)}
              icon={RotateCcw}
              onConfirm={(actionType, confirmation) => action.mutate({ action: actionType, payload: { source: "tenant_operations_ui", confirmation } })}
            />
            <ConfirmAction
              action="clear_pending_queues"
              label="Cancelar pendentes"
              title="Cancelar todas as mensagens pendentes?"
              description="As mensagens pending serão marcadas como canceled. Nenhum registro será excluído fisicamente."
              pending={action.isPending}
              destructive
              impactCount={number(queueCounts?.pending)}
              icon={XCircle}
              onConfirm={(actionType, confirmation) => action.mutate({ action: actionType, payload: { source: "tenant_operations_ui", confirmation } })}
            />
            <ConfirmAction
              action="cancel_stale_messages"
              label="Descartar backlog antigo (>24h)"
              title="Descartar mensagens antigas?"
              description="Somente mensagens pending criadas há mais de 24 horas serão marcadas como stale_canceled, sem exclusão física."
              pending={action.isPending}
              destructive
              impactCount={number(queues.data?.age_buckets?.over_24h)}
              onPreview={async () => {
                const result = await action.mutateAsync({ action: "preview_stale_messages", payload: { source: "tenant_operations_ui" } });
                return result.preview_count ?? 0;
              }}
              icon={ShieldAlert}
              onConfirm={(actionType, confirmation) => action.mutate({ action: actionType, payload: { source: "tenant_operations_ui", confirmation } })}
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
        actions={<MediaOperationsManager media={media.data} />}
      />
      <OperationsCard
        title="Prompts & Fluxos"
        description="Rascunhos, versões publicadas e rollback"
        icon={GitBranch}
        status="healthy"
        loading={promptsFlows.isLoading}
        error={promptsFlows.isError}
        metrics={[
          { label: "Prompts", value: number(promptsFlows.data?.prompts.length) },
          { label: "Prompts publicados", value: promptsFlows.data?.prompts.filter((item) => item.status === "published").length || 0 },
          { label: "Fluxos", value: number(promptsFlows.data?.flows.length) },
          { label: "Fluxos ativos", value: promptsFlows.data?.flows.filter((item) => item.active).length || 0 },
        ]}
        actions={<PromptsFlowsManager data={promptsFlows.data} />}
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
