import { Bell, Bot, CalendarClock, Database, Images, MessageCircle } from "lucide-react";
import { useTenantOperations } from "@/hooks/useTenantOperations";
import { OperationsCard } from "./OperationsCard";

const number = (value: unknown) => typeof value === "number" ? value : 0;
const yesNo = (value: unknown) => value === true ? "Sim" : "Não";

export function TenantOperationsModules() {
  const agenda = useTenantOperations("agenda");
  const whatsapp = useTenantOperations("whatsapp");
  const queues = useTenantOperations("queues", { refetchInterval: 30_000 });
  const ai = useTenantOperations("ai_handoff", { refetchInterval: 30_000 });
  const media = useTenantOperations("media");
  const alerts = useTenantOperations("alerts", { refetchInterval: 60_000 });

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
          { label: "Processando", value: number(media.data?.counts?.processing) },
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
