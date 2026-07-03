import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Plus, Zap, History, Trash2, Play, AlertCircle, CheckCircle2, Clock, Filter, ListChecks } from "lucide-react";
import { FlowConditionsDialog } from "./FlowConditionsDialog";
import { FlowHelpPanel } from "./FlowHelpPanel";
import { FlowActionsEditor } from "./FlowActionsEditor";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  useOrbitFlows,
  useOrbitFlowTemplates,
  useOrbitFlowRuns,
  useOrbitFlowActions,
  useToggleFlow,
  useDeleteFlow,
  useCreateFlowFromTemplate,
  type OrbitFlow,
  type OrbitFlowTemplate,
} from "@/hooks/useOrbitFlows";
import { FlowEventMap } from "./FlowEventMap";
import { InstantiateCoreFlowButton } from "./InstantiateCoreFlowButton";
import { toast } from "sonner";

const TRIGGER_LABELS: Record<string, string> = {
  prospect_qualified: "Lead qualificado",
  deal_stage_changed: "Etapa do funil alterada",
  deal_idle: "Deal parado",
  conversa_no_reply: "Conversa sem resposta",
  lead_recebido: "Lead recebido (externo)",
  meeting_reminder_24h: "Lembrete 24h reunião",
  meeting_reminder_1h: "Lembrete 1h reunião",
};

const STATUS_BADGE: Record<string, { label: string; cls: string; icon: any }> = {
  pending: { label: "Aguardando", cls: "bg-muted text-muted-foreground", icon: Clock },
  running: { label: "Executando", cls: "bg-blue-500/20 text-blue-300", icon: Play },
  success: { label: "Sucesso", cls: "bg-green-500/20 text-green-300", icon: CheckCircle2 },
  error: { label: "Erro", cls: "bg-red-500/20 text-red-300", icon: AlertCircle },
  skipped: { label: "Ignorado", cls: "bg-muted text-muted-foreground", icon: Clock },
};

export function FluxosTab({ empresaId }: { empresaId: string | null | undefined }) {
  const [wizardOpen, setWizardOpen] = useState(false);
  const [historyFlow, setHistoryFlow] = useState<OrbitFlow | null>(null);
  const [conditionsFlow, setConditionsFlow] = useState<OrbitFlow | null>(null);
  const [actionsFlow, setActionsFlow] = useState<OrbitFlow | null>(null);

  const { data: flows, isLoading } = useOrbitFlows(empresaId);
  const toggle = useToggleFlow();
  const del = useDeleteFlow();

  if (!empresaId) {
    return <div className="text-sm text-muted-foreground">Selecione uma empresa para configurar fluxos.</div>;
  }

  return (
    <div className="space-y-4">
      <FlowHelpPanel />
      <FlowEventMap empresaId={empresaId} />

      <Card className="glass-card">
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Zap className="h-5 w-5 text-primary" />
              Motor de Fluxos
            </CardTitle>
            <CardDescription>
              Automatize ações com base em eventos do CRM (lead qualificado, mudança de etapa, etc.).
            </CardDescription>
          </div>
          <Button
            onClick={() => setWizardOpen(true)}
            className="bg-brand text-brand-foreground hover:bg-brand/90"
          >
            <Plus className="h-4 w-4 mr-2" />
            Novo Fluxo
          </Button>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-sm text-muted-foreground">Carregando...</div>
          ) : !flows || flows.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Zap className="h-10 w-10 mx-auto mb-2 opacity-40" />
              <p className="text-sm">Nenhum fluxo criado. Comece a partir de um template.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {flows.map((f) => (
                <div
                  key={f.id}
                  className="flex items-center justify-between p-3 rounded-md border border-border bg-card/50"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium truncate">{f.nome}</span>
                      <Badge variant="outline" className="text-xs">
                        {TRIGGER_LABELS[f.trigger_type] ?? f.trigger_type}
                      </Badge>
                    </div>
                    {f.descricao && <p className="text-xs text-muted-foreground truncate mt-0.5">{f.descricao}</p>}
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={f.ativo}
                      onCheckedChange={(v) =>
                        toggle.mutate(
                          { id: f.id, ativo: v },
                          { onSuccess: () => toast.success(v ? "Fluxo ativado" : "Fluxo pausado") }
                        )
                      }
                    />
                    <Button variant="ghost" size="icon" title="Condições" onClick={() => setConditionsFlow(f)}>
                      <Filter className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" title="Ações" onClick={() => setActionsFlow(f)}>
                      <ListChecks className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" title="Histórico" onClick={() => setHistoryFlow(f)}>
                      <History className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => {
                        if (confirm(`Excluir o fluxo "${f.nome}"?`)) {
                          del.mutate(f.id, { onSuccess: () => toast.success("Fluxo excluído") });
                        }
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <NewFlowWizard
        open={wizardOpen}
        onOpenChange={setWizardOpen}
        empresaId={empresaId}
      />

      <FlowHistoryDialog flow={historyFlow} onClose={() => setHistoryFlow(null)} />
      <FlowConditionsDialog
        flow={conditionsFlow}
        empresaId={empresaId}
        onClose={() => setConditionsFlow(null)}
      />
      <FlowActionsEditor flow={actionsFlow} onClose={() => setActionsFlow(null)} />
    </div>
  );
}

function NewFlowWizard({
  open,
  onOpenChange,
  empresaId,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  empresaId: string;
}) {
  const { data: templates } = useOrbitFlowTemplates();
  const create = useCreateFlowFromTemplate();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Criar fluxo</DialogTitle>
          <DialogDescription>Escolha um template ou comece em branco. O fluxo nasce inativo.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 py-2 max-h-[60vh] overflow-y-auto pr-1">
          {(templates ?? []).map((t) => (
            <button
              key={t.id}
              className="text-left p-3 rounded-md border border-border hover:bg-muted/30 transition"
              onClick={() => {
                create.mutate(
                  { empresaId, template: t },
                  {
                    onSuccess: () => {
                      toast.success("Template carregado!", {
                        description: "O editor de fluxos estará disponível em breve. Seu fluxo foi criado inativo.",
                      });
                      onOpenChange(false);
                    },
                    onError: (e: any) => toast.error(`Erro: ${e.message}`),
                  }
                );
              }}
            >
              <div className="font-medium">{t.nome}</div>
              {t.descricao && <div className="text-xs text-muted-foreground mt-1">{t.descricao}</div>}
              {t.categoria && (
                <Badge variant="outline" className="text-[10px] mt-2">
                  {t.categoria}
                </Badge>
              )}
            </button>
          ))}
          <button
            className="text-left p-3 rounded-md border border-dashed border-border hover:bg-muted/30 transition"
            onClick={() => {
              create.mutate(
                { empresaId, template: null },
                {
                  onSuccess: () => {
                    toast.success("Fluxo em branco criado");
                    onOpenChange(false);
                  },
                }
              );
            }}
          >
            <div className="font-medium">Começar em branco</div>
            <div className="text-xs text-muted-foreground mt-1">
              Configurar trigger e ações manualmente depois.
            </div>
          </button>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function FlowHistoryDialog({ flow, onClose }: { flow: OrbitFlow | null; onClose: () => void }) {
  const { data: runs, isLoading } = useOrbitFlowRuns(flow?.id);
  const { data: actions } = useOrbitFlowActions(flow?.id);

  return (
    <Dialog open={!!flow} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{flow?.nome}</DialogTitle>
          <DialogDescription>
            {actions?.length ?? 0} ação(ões) configurada(s) · Últimas 20 execuções
          </DialogDescription>
        </DialogHeader>
        <ScrollArea className="max-h-[400px] pr-2">
          {isLoading ? (
            <div className="text-sm text-muted-foreground">Carregando...</div>
          ) : !runs || runs.length === 0 ? (
            <div className="text-sm text-muted-foreground py-4 text-center">Nenhuma execução ainda.</div>
          ) : (
            <div className="space-y-2">
              {runs.map((r) => {
                const sb = STATUS_BADGE[r.status] ?? STATUS_BADGE.pending;
                const Icon = sb.icon;
                return (
                  <div key={r.id} className="flex items-center justify-between p-2 rounded border border-border">
                    <div className="flex items-center gap-2">
                      <Icon className="h-4 w-4" />
                      <Badge className={sb.cls}>{sb.label}</Badge>
                      <span className="text-xs text-muted-foreground">
                        {formatDistanceToNow(new Date(r.created_at), { addSuffix: true, locale: ptBR })}
                      </span>
                    </div>
                    {r.error && <span className="text-xs text-red-400 truncate max-w-[200px]">{r.error}</span>}
                  </div>
                );
              })}
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
