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
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Plus,
  Trash2,
  Pencil,
  GitBranch,
  CheckCircle2,
  XCircle,
  FolderPlus,
} from "lucide-react";
import type { OrbitFlowAction, OrbitFlowActionType } from "@/hooks/useOrbitFlows";
import type { PipelineStage } from "@/hooks/useOrbitPipelineConfig";
import {
  FLOW_CONDITION_FIELDS,
  OP_LABELS,
  OPS_NEEDING_VALUE,
  MAX_CONDITION_DEPTH,
  isGroup,
  normalizeGroup,
  type ConditionOp,
  type ConditionRule,
  type ConditionGroup,
  type ConditionNode,
} from "@/lib/flowConditionFields";
import { ACTION_CATALOG, ActionEditDialog, ActionPickerDialog, META_BY_TYPE } from "./FlowActionsEditor";
import { SortableList } from "./SortableList";

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
  return { condition: { logic: "AND", children: [] }, then: [], else: [] };
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
      condition: normalizeGroup(raw?.condition),
      then: Array.isArray(raw?.then) ? raw.then : [],
      else: Array.isArray(raw?.else) ? raw.else : [],
    });
    setDelay(action.delay_seconds ?? 0);
  }, [action?.id]);

  if (!action) return null;

  return (
    <Dialog open={!!action} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <GitBranch className="h-5 w-5 text-primary" />
            Condição · Se / Senão
          </DialogTitle>
          <DialogDescription>
            Se as regras forem verdadeiras, executa <b>Então</b>. Caso contrário, executa <b>Senão</b>.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <ConditionBuilder
            group={cfg.condition}
            onChange={(g) => setCfg((c) => ({ ...c, condition: g }))}
          />

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
              <SortableActionList
                items={cfg.then}
                stages={stages}
                onChange={(items) => setCfg((c) => ({ ...c, then: items }))}
                emptyLabel="Sem ações no bloco 'Então'."
              />
            </TabsContent>
            <TabsContent value="else">
              <SortableActionList
                items={cfg.else}
                stages={stages}
                onChange={(items) => setCfg((c) => ({ ...c, else: items }))}
                emptyLabel="Sem ações no bloco 'Senão' — se falhar, o fluxo apenas segue."
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

// ── Editor de condição recursivo (grupos aninhados) ─────────────────

export function ConditionBuilder({
  group,
  onChange,
  depth = 1,
  onRemove,
}: {
  group: ConditionGroup;
  onChange: (g: ConditionGroup) => void;
  depth?: number;
  onRemove?: () => void;
}) {
  const g = normalizeGroup(group);
  const children = g.children ?? [];

  const setChildren = (next: ConditionNode[]) =>
    onChange({ logic: g.logic, children: next });

  const setLogic = (logic: "AND" | "OR") => onChange({ ...g, logic });

  const addRule = () =>
    setChildren([
      ...children,
      { field: "prospect.documento_tipo", op: "equals", value: "" } as ConditionRule,
    ]);

  const addGroup = () =>
    setChildren([...children, { logic: "AND", children: [] } as ConditionGroup]);

  const canNest = depth < MAX_CONDITION_DEPTH;
  const borderColors = ["border-l-primary/70", "border-l-amber-500/70", "border-l-purple-500/70"];
  const borderClass = depth === 1 ? "" : `border-l-2 pl-3 ${borderColors[(depth - 2) % 3]}`;

  return (
    <div className={`rounded-md ${depth === 1 ? "border border-border p-3" : borderClass} space-y-2`}>
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <Label className="text-xs">{depth === 1 ? "Regras" : `Grupo (nível ${depth})`}</Label>
          <Select value={g.logic} onValueChange={(v) => setLogic(v as "AND" | "OR")}>
            <SelectTrigger className="h-8 w-[130px] text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="AND">Todas (E)</SelectItem>
              <SelectItem value="OR">Qualquer (OU)</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-1">
          <Button size="sm" variant="ghost" onClick={addRule} className="h-8">
            <Plus className="h-3.5 w-3.5 mr-1" /> Regra
          </Button>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <span>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={addGroup}
                    disabled={!canNest}
                    className="h-8"
                  >
                    <FolderPlus className="h-3.5 w-3.5 mr-1" /> Grupo
                  </Button>
                </span>
              </TooltipTrigger>
              {!canNest && (
                <TooltipContent>Máx. {MAX_CONDITION_DEPTH} níveis</TooltipContent>
              )}
            </Tooltip>
          </TooltipProvider>
          {onRemove && (
            <Button size="icon" variant="ghost" onClick={onRemove} className="h-8 w-8">
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </div>

      {children.length === 0 ? (
        <div className="text-xs text-muted-foreground py-1">
          Sem regras — sempre verdadeiro.
        </div>
      ) : (
        <div className="space-y-2">
          {children.map((child, i) => {
            const update = (next: ConditionNode) =>
              setChildren(children.map((c, j) => (j === i ? next : c)));
            const remove = () => setChildren(children.filter((_, j) => j !== i));
            if (isGroup(child)) {
              return (
                <ConditionBuilder
                  key={i}
                  group={child}
                  depth={depth + 1}
                  onChange={(next) => update(next)}
                  onRemove={remove}
                />
              );
            }
            return (
              <RuleRow
                key={i}
                rule={child}
                onChange={(next) => update(next)}
                onDelete={remove}
              />
            );
          })}
        </div>
      )}
    </div>
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

// ── Lista de sub-ações com drag-and-drop ────────────────────────────

export function SortableActionList({
  items,
  stages,
  onChange,
  emptyLabel,
  disallowNested,
}: {
  items: SubAction[];
  stages: PipelineStage[];
  onChange: (items: SubAction[]) => void;
  emptyLabel: string;
  disallowNested?: boolean;
}) {
  const [picking, setPicking] = useState(false);
  const [editIdx, setEditIdx] = useState<number | null>(null);
  const stagesById = useMemo(
    () => Object.fromEntries((stages ?? []).map((s) => [s.id, s])) as Record<string, PipelineStage>,
    [stages],
  );

  const withIds = useMemo(
    () => items.map((it, i) => ({ ...it, __id: `sub-${i}` })),
    [items],
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
        <SortableList
          items={withIds.map((it, i) => ({ id: it.__id, idx: i, sub: items[i] }))}
          onReorder={(next) => onChange(next.map((n) => n.sub))}
          className="space-y-2"
          renderItem={(row, handle, i) => {
            const sub = row.sub;
            const meta = META_BY_TYPE[sub.action_type];
            if (!meta) return null;
            const Icon = meta.icon;
            return (
              <div className="flex items-center gap-2 p-2 rounded-md border border-border bg-card/40">
                {handle}
                <Badge variant="outline" className="text-[10px]">{i + 1}</Badge>
                <Icon className="h-4 w-4 text-primary shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm truncate">{meta.label}</div>
                  <div className="text-[11px] text-muted-foreground truncate">
                    {sub.delay_seconds ? `Após ${sub.delay_seconds}s · ` : ""}
                    {shortSummary(sub, stagesById)}
                  </div>
                </div>
                <Button variant="ghost" size="icon" onClick={() => setEditIdx(row.idx)}>
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => onChange(items.filter((_, j) => j !== row.idx))}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            );
          }}
        />
      )}

      <Button size="sm" variant="ghost" onClick={() => setPicking(true)}>
        <Plus className="h-3.5 w-3.5 mr-1" /> Adicionar ação
      </Button>

      <ActionPickerDialog
        open={picking}
        onClose={() => setPicking(false)}
        onPick={(meta) => {
          if (disallowNested && (meta.type === "if_else" || meta.type === "switch")) {
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
    case "if_else": return "condição aninhada";
    case "switch": return `roteamento (${c.cases?.length ?? 0} casos)`;
    default: return "";
  }
}
