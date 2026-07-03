import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  GripVertical,
  Plus,
  Trash2,
  MessageSquare,
  ArrowRightLeft,
  ListChecks,
  Bot,
  BellRing,
  Paperclip,
  CalendarClock,
  Timer,
  Pencil,
  GitBranch,
  ExternalLink,
} from "lucide-react";
import {
  useOrbitFlowActions,
  useUpsertFlowAction,
  useDeleteFlowAction,
  type OrbitFlow,
  type OrbitFlowAction,
  type OrbitFlowActionType,
} from "@/hooks/useOrbitFlows";
import { usePipelineStages, type PipelineStage } from "@/hooks/useOrbitPipelineConfig";
import { FlowIfElseEditor } from "./FlowIfElseEditor";
import { toast } from "sonner";

type ActionMeta = {
  type: OrbitFlowActionType;
  label: string;
  desc: string;
  icon: any;
  defaultConfig: Record<string, any>;
};

const ACTION_CATALOG: ActionMeta[] = [
  {
    type: "send_whatsapp_template",
    label: "Enviar template WhatsApp",
    desc: "Dispara uma mensagem usando um template salvo.",
    icon: MessageSquare,
    defaultConfig: { template_slug: "" },
  },
  {
    type: "send_rich_media",
    label: "Enviar mídia (PDF/áudio/vídeo)",
    desc: "Envia documento, áudio, imagem ou vídeo para o lead.",
    icon: Paperclip,
    defaultConfig: { tipo_midia: "document", url_midia: "", legenda: "" },
  },
  {
    type: "check_calendar_and_offer",
    label: "Agendamento inteligente",
    desc: "Consulta o Google Calendar e oferece horários disponíveis.",
    icon: CalendarClock,
    defaultConfig: {
      lookahead_days: 5,
      slot_minutes: 30,
      start_hour: 9,
      end_hour: 18,
      max_offers: 3,
      mensagem: "Posso te oferecer estes horários para conversarmos:",
      rodape: "Responda com o número da opção que preferir. ✅",
    },
  },
  {
    type: "delay_execution",
    label: "Espera / Atraso temporário",
    desc: "Pausa o fluxo por X minutos ou horas antes da próxima ação.",
    icon: Timer,
    defaultConfig: { wait_value: 10, wait_unit: "minutes" },
  },
  {
    type: "change_deal_stage",
    label: "Mover no funil",
    desc: "Avança ou retorna o deal para outra etapa do pipeline.",
    icon: ArrowRightLeft,
    defaultConfig: { to_stage_id: "", to_stage_slug: "" },
  },
  {
    type: "move_deal_stage",
    label: "Mover etapa (legado)",
    desc: "Versão antiga — prefira 'Mover no funil'.",
    icon: ArrowRightLeft,
    defaultConfig: { to_stage_id: "" },
  },
  {
    type: "create_task",
    label: "Criar tarefa",
    desc: "Gera uma tarefa de follow-up para o vendedor.",
    icon: ListChecks,
    defaultConfig: { titulo: "Follow-up automático", prazo_dias: 1, tipo_tarefa: "follow_up" },
  },
  {
    type: "toggle_ai_agent",
    label: "Ligar/Desligar IA",
    desc: "Ativa ou pausa o atendimento humano na conversa.",
    icon: Bot,
    defaultConfig: { human_talk: false },
  },
  {
    type: "notify_vendedor",
    label: "Notificar vendedor",
    desc: "Envia notificação ao vendedor responsável.",
    icon: BellRing,
    defaultConfig: { canal: "email" },
  },
  {
    type: "if_else",
    label: "Condição (Se / Senão)",
    desc: "Executa um bloco de ações se a condição for verdadeira, outro se for falsa.",
    icon: GitBranch,
    defaultConfig: {
      condition: { logic: "AND", rules: [] },
      then: [],
      else: [],
    },
  },
];

export const META_BY_TYPE = Object.fromEntries(ACTION_CATALOG.map((m) => [m.type, m])) as Record<
  OrbitFlowActionType,
  ActionMeta
>;
export { ACTION_CATALOG };

export function FlowActionsEditor({
  flow,
  onClose,
}: {
  flow: OrbitFlow | null;
  onClose: () => void;
}) {
  const { data: actions = [], isLoading } = useOrbitFlowActions(flow?.id);
  const { data: stages = [] } = usePipelineStages();
  const stagesById = Object.fromEntries((stages ?? []).map((s) => [s.id, s])) as Record<string, PipelineStage>;
  const upsert = useUpsertFlowAction();
  const del = useDeleteFlowAction();
  const [picking, setPicking] = useState(false);
  const [editing, setEditing] = useState<OrbitFlowAction | null>(null);
  const [ifElseEditing, setIfElseEditing] = useState<OrbitFlowAction | null>(null);

  if (!flow) return null;

  const handleAdd = (meta: ActionMeta) => {
    const nextOrdem = (actions[actions.length - 1]?.ordem ?? -1) + 1;
    upsert.mutate(
      {
        flow_id: flow.id,
        ordem: nextOrdem,
        action_type: meta.type,
        action_config: { ...meta.defaultConfig },
        delay_seconds: 0,
      },
      {
        onSuccess: (created: any) => {
          setPicking(false);
          if (created) {
            if (meta.type === "if_else") setIfElseEditing(created as OrbitFlowAction);
            else setEditing(created as OrbitFlowAction);
          }
          toast.success("Ação adicionada");
        },
        onError: (e: any) => toast.error(`Erro: ${e.message}`),
      },
    );
  };

  return (
    <>
      <Dialog open={!!flow} onOpenChange={(v) => !v && onClose()}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Ações do fluxo · {flow.nome}</DialogTitle>
            <DialogDescription>
              Sequência de ações executadas quando o gatilho dispara. Ordem importa.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2 max-h-[55vh] overflow-y-auto pr-1">
            {isLoading ? (
              <div className="text-sm text-muted-foreground">Carregando...</div>
            ) : actions.length === 0 ? (
              <div className="text-center py-6 text-muted-foreground text-sm">
                Nenhuma ação configurada. Clique em "Adicionar ação" para começar.
              </div>
            ) : (
              actions.map((a, idx) => {
                const meta = META_BY_TYPE[a.action_type] ?? {
                  type: a.action_type,
                  label: a.action_type,
                  desc: "Ação personalizada",
                  icon: ListChecks,
                  defaultConfig: {},
                };
                const Icon = meta.icon;
                return (
                  <div
                    key={a.id}
                    className="flex items-center gap-3 p-3 rounded-md border border-border bg-card/50"
                  >
                    <GripVertical className="h-4 w-4 text-muted-foreground shrink-0" />
                    <Badge variant="outline" className="text-[10px]">{idx + 1}</Badge>
                    <Icon className="h-4 w-4 text-primary shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm truncate">{meta.label}</div>
                      <div className="text-xs text-muted-foreground truncate">
                        {a.delay_seconds ? `Após ${a.delay_seconds}s · ` : ""}
                        {summarizeConfig(a, stagesById)}
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() =>
                        a.action_type === "if_else" ? setIfElseEditing(a) : setEditing(a)
                      }
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => {
                        if (confirm("Excluir esta ação?")) {
                          del.mutate(
                            { id: a.id, flow_id: flow.id },
                            { onSuccess: () => toast.success("Ação removida") },
                          );
                        }
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                );
              })
            )}
          </div>

          <DialogFooter className="flex sm:justify-between gap-2">
            <Button onClick={() => setPicking(true)} className="bg-brand text-brand-foreground hover:bg-brand/90">
              <Plus className="h-4 w-4 mr-2" /> Adicionar ação
            </Button>
            <Button variant="ghost" onClick={onClose}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ActionPickerDialog open={picking} onClose={() => setPicking(false)} onPick={handleAdd} />
      <ActionEditDialog
        action={editing}
        onClose={() => setEditing(null)}
        onSave={(patch) => {
          if (!editing) return;
          upsert.mutate(
            {
              id: editing.id,
              flow_id: editing.flow_id,
              ordem: editing.ordem,
              action_type: editing.action_type,
              action_config: patch.action_config,
              delay_seconds: patch.delay_seconds,
            },
            {
              onSuccess: () => {
                toast.success("Ação atualizada");
                setEditing(null);
              },
              onError: (e: any) => toast.error(`Erro: ${e.message}`),
            },
          );
        }}
      />
      <FlowIfElseEditor
        action={ifElseEditing}
        stages={stages}
        onClose={() => setIfElseEditing(null)}
        onSave={(patch) => {
          if (!ifElseEditing) return;
          upsert.mutate(
            {
              id: ifElseEditing.id,
              flow_id: ifElseEditing.flow_id,
              ordem: ifElseEditing.ordem,
              action_type: ifElseEditing.action_type,
              action_config: patch.action_config,
              delay_seconds: patch.delay_seconds,
            },
            {
              onSuccess: () => {
                toast.success("Ação atualizada");
                setIfElseEditing(null);
              },
              onError: (e: any) => toast.error(`Erro: ${e.message}`),
            },
          );
        }}
      />
    </>
  );
}

function summarizeConfig(a: OrbitFlowAction, stagesById?: Record<string, PipelineStage>): string {
  const c = a.action_config ?? {};
  switch (a.action_type) {
    case "send_whatsapp_template": return c.template_slug ? `template: ${c.template_slug}` : "sem template";
    case "send_rich_media": return `${c.tipo_midia || "?"} · ${c.url_midia ? "URL ok" : "sem URL"}`;
    case "check_calendar_and_offer": return `${c.max_offers ?? 3} horários · ${c.start_hour ?? 9}h-${c.end_hour ?? 18}h`;
    case "change_deal_stage":
    case "move_deal_stage": {
      const stage = c.to_stage_id ? stagesById?.[c.to_stage_id] : undefined;
      if (stage) return `→ ${stage.nome}`;
      if (c.to_stage_slug) return `→ ${c.to_stage_slug}`;
      if (c.to_stage_id) return "→ etapa definida";
      return "etapa não definida";
    }
    case "create_task": return `${c.titulo || "tarefa"} · ${c.prazo_dias ?? 1}d`;
    case "toggle_ai_agent": return c.human_talk ? "modo humano" : "modo IA";
    case "notify_vendedor": return `canal: ${c.canal || "email"}`;
    case "delay_execution": return `aguarda ${c.wait_value ?? 0} ${c.wait_unit === "hours" ? "h" : "min"}`;
    case "if_else": {
      const rules = c?.condition?.rules?.length ?? 0;
      const thenN = Array.isArray(c?.then) ? c.then.length : 0;
      const elseN = Array.isArray(c?.else) ? c.else.length : 0;
      return `Se ${rules} regra(s) · Então ${thenN} · Senão ${elseN}`;
    }
    default: return "";
  }
}

function ActionPickerDialog({
  open,
  onClose,
  onPick,
}: {
  open: boolean;
  onClose: () => void;
  onPick: (m: ActionMeta) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Adicionar ação</DialogTitle>
          <DialogDescription>Escolha o tipo de ação a executar.</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-[55vh] overflow-y-auto pr-1">
          {ACTION_CATALOG.map((m) => {
            const Icon = m.icon;
            return (
              <button
                key={m.type}
                onClick={() => onPick(m)}
                className="text-left p-3 rounded-md border border-border hover:bg-muted/30 transition flex gap-2"
              >
                <Icon className="h-5 w-5 text-primary mt-0.5 shrink-0" />
                <div className="min-w-0">
                  <div className="font-medium text-sm">{m.label}</div>
                  <div className="text-xs text-muted-foreground">{m.desc}</div>
                </div>
              </button>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ActionEditDialog({
  action,
  onClose,
  onSave,
}: {
  action: OrbitFlowAction | null;
  onClose: () => void;
  onSave: (patch: { action_config: Record<string, any>; delay_seconds: number }) => void;
}) {
  const [cfg, setCfg] = useState<Record<string, any>>({});
  const [delay, setDelay] = useState<number>(0);

  useEffect(() => {
    if (action) {
      setCfg(action.action_config ?? {});
      setDelay(action.delay_seconds ?? 0);
    }
  }, [action?.id]);

  if (!action) return null;
  const meta = META_BY_TYPE[action.action_type];

  return (
    <Dialog
      open={!!action}
      onOpenChange={(v) => {
        if (!v) {
          setCfg({});
          setDelay(0);
          onClose();
        }
      }}
    >
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Configurar · {meta?.label ?? action.action_type}</DialogTitle>
          <DialogDescription>{meta?.desc}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 max-h-[55vh] overflow-y-auto pr-1">
          <Field label="Atraso antes de executar (segundos)">
            <Input
              type="number"
              min={0}
              value={delay}
              onChange={(e) => setDelay(Math.max(0, Number(e.target.value || 0)))}
            />
          </Field>

          {action.action_type === "send_whatsapp_template" && (
            <Field label="Slug ou nome do template">
              <Input
                value={cfg.template_slug ?? ""}
                onChange={(e) => setCfg({ ...cfg, template_slug: e.target.value })}
                placeholder="ex.: boas-vindas-lead"
              />
            </Field>
          )}

          {action.action_type === "send_rich_media" && (
            <>
              <Field label="Tipo de mídia">
                <Select value={cfg.tipo_midia ?? "document"} onValueChange={(v) => setCfg({ ...cfg, tipo_midia: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="document">Documento (PDF/ebook)</SelectItem>
                    <SelectItem value="audio">Áudio</SelectItem>
                    <SelectItem value="video">Vídeo</SelectItem>
                    <SelectItem value="image">Imagem</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label="URL pública do arquivo">
                <Input
                  value={cfg.url_midia ?? ""}
                  onChange={(e) => setCfg({ ...cfg, url_midia: e.target.value })}
                  placeholder="https://..."
                />
              </Field>
              {cfg.tipo_midia === "document" && (
                <Field label="Nome do arquivo (opcional)">
                  <Input
                    value={cfg.file_name ?? ""}
                    onChange={(e) => setCfg({ ...cfg, file_name: e.target.value })}
                    placeholder="ebook.pdf"
                  />
                </Field>
              )}
              {(cfg.tipo_midia === "image" || cfg.tipo_midia === "video") && (
                <Field label="Legenda (opcional)">
                  <Textarea
                    value={cfg.legenda ?? ""}
                    onChange={(e) => setCfg({ ...cfg, legenda: e.target.value })}
                    rows={2}
                  />
                </Field>
              )}
            </>
          )}

          {action.action_type === "check_calendar_and_offer" && (
            <>
              <div className="grid grid-cols-2 gap-2">
                <Field label="Dias à frente">
                  <Input
                    type="number" min={1} max={14}
                    value={cfg.lookahead_days ?? 5}
                    onChange={(e) => setCfg({ ...cfg, lookahead_days: Number(e.target.value) })}
                  />
                </Field>
                <Field label="Duração do slot (min)">
                  <Input
                    type="number" min={15} max={180}
                    value={cfg.slot_minutes ?? 30}
                    onChange={(e) => setCfg({ ...cfg, slot_minutes: Number(e.target.value) })}
                  />
                </Field>
                <Field label="Início (hora)">
                  <Input
                    type="number" min={0} max={23}
                    value={cfg.start_hour ?? 9}
                    onChange={(e) => setCfg({ ...cfg, start_hour: Number(e.target.value) })}
                  />
                </Field>
                <Field label="Fim (hora)">
                  <Input
                    type="number" min={1} max={24}
                    value={cfg.end_hour ?? 18}
                    onChange={(e) => setCfg({ ...cfg, end_hour: Number(e.target.value) })}
                  />
                </Field>
                <Field label="Máx. horários oferecidos">
                  <Input
                    type="number" min={1} max={8}
                    value={cfg.max_offers ?? 3}
                    onChange={(e) => setCfg({ ...cfg, max_offers: Number(e.target.value) })}
                  />
                </Field>
              </div>
              <Field label="Mensagem de cabeçalho">
                <Textarea
                  value={cfg.mensagem ?? ""}
                  onChange={(e) => setCfg({ ...cfg, mensagem: e.target.value })}
                  rows={2}
                />
              </Field>
              <Field label="Rodapé">
                <Input
                  value={cfg.rodape ?? ""}
                  onChange={(e) => setCfg({ ...cfg, rodape: e.target.value })}
                />
              </Field>
            </>
          )}

          {(action.action_type === "change_deal_stage" || action.action_type === "move_deal_stage") && (
            <StageSelectField
              value={cfg.to_stage_id ?? ""}
              onChange={(stage) =>
                setCfg({
                  ...cfg,
                  to_stage_id: stage?.id ?? "",
                  to_stage_slug: stage?.slug ?? "",
                })
              }
            />
          )}

          {action.action_type === "create_task" && (
            <>
              <Field label="Título">
                <Input
                  value={cfg.titulo ?? ""}
                  onChange={(e) => setCfg({ ...cfg, titulo: e.target.value })}
                />
              </Field>
              <Field label="Prazo (dias)">
                <Input
                  type="number" min={0}
                  value={cfg.prazo_dias ?? 1}
                  onChange={(e) => setCfg({ ...cfg, prazo_dias: Number(e.target.value) })}
                />
              </Field>
            </>
          )}

          {action.action_type === "toggle_ai_agent" && (
            <Field label="Modo">
              <Select
                value={cfg.human_talk ? "human" : "ai"}
                onValueChange={(v) => setCfg({ ...cfg, human_talk: v === "human" })}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ai">IA assume</SelectItem>
                  <SelectItem value="human">Humano assume</SelectItem>
                </SelectContent>
              </Select>
            </Field>
          )}

          {action.action_type === "notify_vendedor" && (
            <Field label="Canal">
              <Select value={cfg.canal ?? "email"} onValueChange={(v) => setCfg({ ...cfg, canal: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="email">E-mail</SelectItem>
                  <SelectItem value="whatsapp">WhatsApp</SelectItem>
                </SelectContent>
              </Select>
            </Field>
          )}

          {action.action_type === "delay_execution" && (
            <div className="grid grid-cols-[1fr_140px] gap-2">
              <Field label="Tempo de espera">
                <Input
                  type="number"
                  min={1}
                  value={cfg.wait_value ?? 10}
                  onChange={(e) => setCfg({ ...cfg, wait_value: Math.max(1, Number(e.target.value || 1)) })}
                />
              </Field>
              <Field label="Unidade">
                <Select
                  value={cfg.wait_unit ?? "minutes"}
                  onValueChange={(v) => setCfg({ ...cfg, wait_unit: v })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="minutes">Minutos</SelectItem>
                    <SelectItem value="hours">Horas</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button
            className="bg-brand text-brand-foreground hover:bg-brand/90"
            onClick={() => onSave({ action_config: cfg, delay_seconds: delay })}
          >
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}

export { ActionPickerDialog, ActionEditDialog };

function StageSelectField({
  value,
  onChange,
}: {
  value: string;
  onChange: (stage: PipelineStage | null) => void;
}) {
  const { data: stages = [], isLoading } = usePipelineStages();
  const hasStages = (stages ?? []).length > 0;
  return (
    <div className="space-y-2">
      <Field label="Etapa de destino no funil">
        {isLoading ? (
          <div className="text-xs text-muted-foreground">Carregando etapas...</div>
        ) : !hasStages ? (
          <div className="text-xs text-amber-400">
            Nenhuma etapa cadastrada. Configure em Pipeline primeiro.
          </div>
        ) : (
          <Select
            value={value || "__none__"}
            onValueChange={(v) => {
              if (v === "__none__") return onChange(null);
              const s = (stages ?? []).find((x) => x.id === v) ?? null;
              onChange(s);
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder="Selecione uma etapa" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">— Nenhuma —</SelectItem>
              {(stages ?? []).map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  <span className="inline-flex items-center gap-2">
                    <span
                      className="inline-block h-2 w-2 rounded-full"
                      style={{ background: s.cor || "hsl(var(--muted-foreground))" }}
                    />
                    {s.nome}
                    {s.is_won ? <span className="text-[10px] text-green-400 ml-1">(ganho)</span> : null}
                    {s.is_lost ? <span className="text-[10px] text-red-400 ml-1">(perdido)</span> : null}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </Field>
      <a
        href="/orbit/config"
        target="_blank"
        rel="noreferrer"
        className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
      >
        <ExternalLink className="h-3 w-3" /> Gerenciar etapas do pipeline
      </a>
    </div>
  );
}
