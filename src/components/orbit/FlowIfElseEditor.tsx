import { useEffect, useMemo, useState } from "react";
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
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Trash2, Pencil, GitBranch, CheckCircle2, XCircle } from "lucide-react";
import type { OrbitFlowAction, OrbitFlowActionType } from "@/hooks/useOrbitFlows";
import type { PipelineStage } from "@/hooks/useOrbitPipelineConfig";
import {
  FLOW_CONDITION_FIELDS,
  OP_LABELS,
  OPS_NEEDING_VALUE,
  type ConditionOp,
  type ConditionRule,
  type ConditionGroup,
} from "@/lib/flowConditionFields";
import { ACTION_CATALOG, ActionEditDialog, ActionPickerDialog, META_BY_TYPE } from "./FlowActionsEditor";

type SubAction = {
  action_type: OrbitFlowActionType;
  action_config: Record<string, any>;
  delay_seconds: number;
};

type IfElseCfg = {
  condition: ConditionGroup;
  then: SubAction[];
  else: SubAction[];
};

function emptyCfg(): IfElseCfg {
  return { condition: { logic: "AND", rules: [] }, then: [], else: [] };
}

export function FlowIfElseEditor({
  action,
  stages,
  onClose,
  onSave,
}: {
  action: OrbitFlowAction | null;
  stages: PipelineStage[];
  onClose: () => void;
  onSave: (patch: { action_config: Record<string, any>; delay_seconds: number }) => void;
}) {
  const [cfg, setCfg] = useState<IfElseCfg>(emptyCfg());
  const [delay, setDelay] = useState<number>(0);

  useEffect(() => {
    if (!action) return;
    const raw = (action.action_config ?? {}) as any;
    setCfg({
      condition: raw?.condition ?? { logic: "AND", rules: [] },
      then: Array.isArray(raw?.then) ? raw.then : [],
      else: Array.isArray(raw?.else) ? raw.else : [],
    });
    setDelay(action.delay_seconds ?? 0);
  }, [action?.id]);

  if (!action) return null;

  const setRules = (rules: ConditionRule[]) =>
    setCfg((c) => ({ ...c, condition: { ...c.condition, rules } }));

  const setLogic = (logic: "AND" | "OR") =>
    setCfg((c) => ({ ...c, condition: { ...c.condition, logic } }));

  return (
    <Dialog open={!!action} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <GitBranch className="h-5 w-5 text-primary" />
            Condição · Se / Senão
          </DialogTitle>
          <DialogDescription>
            Se as regras forem verdadeiras, executa o bloco <b>Então</b>. Caso contrário, executa <b>Senão</b>.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-md border border-border p-3 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <Label className="text-sm">Regras</Label>
              <div className="flex items-center gap-2">
                <Select value={cfg.condition.logic} onValueChange={(v) => setLogic(v as "AND" | "OR")}>
                  <SelectTrigger className="h-8 w-[130px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="AND">Todas (E)</SelectItem>
                    <SelectItem value="OR">Qualquer (OU)</SelectItem>
                  </SelectContent>
                </Select>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() =>
                    setRules([
                      ...cfg.condition.rules,
                      { field: "prospect.documento_tipo", op: "equals", value: "" },
                    ])
                  }
                >
                  <Plus className="h-3.5 w-3.5 mr-1" /> Adicionar regra
                </Button>
              </div>
            </div>

            {cfg.condition.rules.length === 0 ? (
              <div className="text-xs text-muted-foreground py-2">
                Sem regras — a condição sempre será verdadeira (bloco "Então" sempre executa).
              </div>
            ) : (
              <div className="space-y-2">
                {cfg.condition.rules.map((r, i) => (
                  <RuleRow
                    key={i}
                    rule={r}
                    onChange={(next) =>
                      setRules(cfg.condition.rules.map((rr, j) => (j === i ? next : rr)))
                    }
                    onDelete={() => setRules(cfg.condition.rules.filter((_, j) => j !== i))}
                  />
                ))}
              </div>
            )}
          </div>

          <Tabs defaultValue="then" className="w-full">
            <TabsList className="grid grid-cols-2 w-full">
              <TabsTrigger value="then" className="gap-2">
                <CheckCircle2 className="h-4 w-4 text-green-400" />
                Então ({cfg.then.length})
              </TabsTrigger>
              <TabsTrigger value="else" className="gap-2">
                <XCircle className="h-4 w-4 text-red-400" />
                Senão ({cfg.else.length})
              </TabsTrigger>
            </TabsList>
            <TabsContent value="then">
              <SubActionList
                items={cfg.then}
                stages={stages}
                onChange={(items) => setCfg((c) => ({ ...c, then: items }))}
                emptyLabel="Sem ações no bloco 'Então'."
              />
            </TabsContent>
            <TabsContent value="else">
              <SubActionList
                items={cfg.else}
                stages={stages}
                onChange={(items) => setCfg((c) => ({ ...c, else: items }))}
                emptyLabel="Sem ações no bloco 'Senão' — se a condição falhar, o fluxo apenas segue."
              />
            </TabsContent>
          </Tabs>

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-xs">Atraso antes de avaliar (segundos)</Label>
              <Input
                type="number"
                min={0}
                value={delay}
                onChange={(e) => setDelay(Math.max(0, Number(e.target.value || 0)))}
              />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button
            className="bg-brand text-brand-foreground hover:bg-brand/90"
            onClick={() => onSave({ action_config: cfg as any, delay_seconds: delay })}
          >
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RuleRow({
  rule,
  onChange,
  onDelete,
}: {
  rule: ConditionRule;
  onChange: (r: ConditionRule) => void;
  onDelete: () => void;
}) {
  const needsValue = OPS_NEEDING_VALUE.includes(rule.op);
  return (
    <div className="grid grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1fr)_auto] gap-2">
      <Select value={rule.field} onValueChange={(v) => onChange({ ...rule, field: v })}>
        <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
        <SelectContent>
          {FLOW_CONDITION_FIELDS.map((g) => (
            <SelectGroup key={g.label}>
              <SelectLabel>{g.label}</SelectLabel>
              {g.fields.map((f) => (
                <SelectItem key={f.value} value={f.value}>
                  {f.label}
                </SelectItem>
              ))}
            </SelectGroup>
          ))}
        </SelectContent>
      </Select>
      <Select value={rule.op} onValueChange={(v) => onChange({ ...rule, op: v as ConditionOp })}>
        <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
        <SelectContent>
          {(Object.keys(OP_LABELS) as ConditionOp[]).map((op) => (
            <SelectItem key={op} value={op}>{OP_LABELS[op]}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Input
        disabled={!needsValue}
        placeholder={needsValue ? "valor" : "—"}
        value={rule.value ?? ""}
        onChange={(e) => onChange({ ...rule, value: e.target.value })}
        className="h-9 text-xs"
      />
      <Button variant="ghost" size="icon" onClick={onDelete}>
        <Trash2 className="h-4 w-4" />
      </Button>
    </div>
  );
}

function SubActionList({
  items,
  stages,
  onChange,
  emptyLabel,
}: {
  items: SubAction[];
  stages: PipelineStage[];
  onChange: (items: SubAction[]) => void;
  emptyLabel: string;
}) {
  const [picking, setPicking] = useState(false);
  const [editIdx, setEditIdx] = useState<number | null>(null);
  const stagesById = useMemo(
    () => Object.fromEntries((stages ?? []).map((s) => [s.id, s])) as Record<string, PipelineStage>,
    [stages],
  );

  const editingAction: OrbitFlowAction | null =
    editIdx == null || !items[editIdx]
      ? null
      : ({
          id: `sub-${editIdx}`,
          flow_id: "",
          ordem: editIdx,
          action_type: items[editIdx].action_type,
          action_config: items[editIdx].action_config,
          delay_seconds: items[editIdx].delay_seconds,
        } as OrbitFlowAction);

  return (
    <div className="space-y-2 pt-2">
      {items.length === 0 ? (
        <div className="text-xs text-muted-foreground py-2 text-center">{emptyLabel}</div>
      ) : (
        items.map((sub, i) => {
          const meta = META_BY_TYPE[sub.action_type];
          if (!meta) return null;
          const Icon = meta.icon;
          return (
            <div key={i} className="flex items-center gap-2 p-2 rounded-md border border-border bg-card/40">
              <Badge variant="outline" className="text-[10px]">{i + 1}</Badge>
              <Icon className="h-4 w-4 text-primary shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-sm truncate">{meta.label}</div>
                <div className="text-[11px] text-muted-foreground truncate">
                  {sub.delay_seconds ? `Após ${sub.delay_seconds}s · ` : ""}
                  {shortSummary(sub, stagesById)}
                </div>
              </div>
              <Button variant="ghost" size="icon" onClick={() => setEditIdx(i)}>
                <Pencil className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => onChange(items.filter((_, j) => j !== i))}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          );
        })
      )}

      <Button size="sm" variant="ghost" onClick={() => setPicking(true)}>
        <Plus className="h-3.5 w-3.5 mr-1" /> Adicionar ação
      </Button>

      <ActionPickerDialog
        open={picking}
        onClose={() => setPicking(false)}
        onPick={(meta) => {
          if (meta.type === "if_else") {
            // v1: não permite if_else aninhado — mantém UI simples
            setPicking(false);
            return;
          }
          const next: SubAction = {
            action_type: meta.type,
            action_config: { ...meta.defaultConfig },
            delay_seconds: 0,
          };
          onChange([...items, next]);
          setPicking(false);
          setEditIdx(items.length);
        }}
      />

      <ActionEditDialog
        action={editingAction}
        onClose={() => setEditIdx(null)}
        onSave={(patch) => {
          if (editIdx == null) return;
          onChange(
            items.map((it, j) =>
              j === editIdx
                ? { ...it, action_config: patch.action_config, delay_seconds: patch.delay_seconds }
                : it,
            ),
          );
          setEditIdx(null);
        }}
      />
    </div>
  );
}

function shortSummary(sub: SubAction, stagesById: Record<string, PipelineStage>): string {
  const c = sub.action_config ?? {};
  switch (sub.action_type) {
    case "send_whatsapp_template": return c.template_slug ? `template: ${c.template_slug}` : "sem template";
    case "send_rich_media": return `${c.tipo_midia || "?"} · ${c.url_midia ? "URL ok" : "sem URL"}`;
    case "change_deal_stage":
    case "move_deal_stage": {
      const s = c.to_stage_id ? stagesById[c.to_stage_id] : undefined;
      return s ? `→ ${s.nome}` : c.to_stage_slug ? `→ ${c.to_stage_slug}` : "etapa não definida";
    }
    case "create_task": return `${c.titulo || "tarefa"} · ${c.prazo_dias ?? 1}d`;
    case "toggle_ai_agent": return c.human_talk ? "modo humano" : "modo IA";
    case "notify_vendedor": return `canal: ${c.canal || "email"}`;
    case "delay_execution": return `aguarda ${c.wait_value ?? 0} ${c.wait_unit === "hours" ? "h" : "min"}`;
    case "check_calendar_and_offer": return `${c.max_offers ?? 3} horários`;
    default: return "";
  }
}
