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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Plus, Trash2, Split, ChevronDown } from "lucide-react";
import type { OrbitFlowAction, OrbitFlowActionType } from "@/hooks/useOrbitFlows";
import type { PipelineStage } from "@/hooks/useOrbitPipelineConfig";
import {
  FLOW_CONDITION_FIELDS,
  OP_LABELS,
  OPS_NEEDING_VALUE,
  type ConditionOp,
} from "@/lib/flowConditionFields";
import { SortableActionList } from "./FlowIfElseEditor";
import { SortableList } from "./SortableList";

type SubAction = {
  action_type: OrbitFlowActionType;
  action_config: Record<string, any>;
  delay_seconds: number;
};

type SwitchCase = {
  id: string;
  label: string;
  match: { op: ConditionOp; value: string };
  actions: SubAction[];
};

type SwitchCfg = {
  field: string;
  cases: SwitchCase[];
  default: { actions: SubAction[] };
};

function emptyCfg(): SwitchCfg {
  return {
    field: "prospect.origem",
    cases: [],
    default: { actions: [] },
  };
}

function newCaseId() {
  return `c_${Math.random().toString(36).slice(2, 8)}`;
}

export function FlowSwitchEditor({
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
  const [cfg, setCfg] = useState<SwitchCfg>(emptyCfg());
  const [delay, setDelay] = useState<number>(0);

  useEffect(() => {
    if (!action) return;
    const raw = (action.action_config ?? {}) as any;
    setCfg({
      field: raw?.field || "prospect.origem",
      cases: Array.isArray(raw?.cases)
        ? raw.cases.map((c: any) => ({
            id: c.id || newCaseId(),
            label: c.label || "",
            match: { op: c.match?.op || "equals", value: c.match?.value ?? "" },
            actions: Array.isArray(c.actions) ? c.actions : [],
          }))
        : [],
      default: { actions: Array.isArray(raw?.default?.actions) ? raw.default.actions : [] },
    });
    setDelay(action.delay_seconds ?? 0);
  }, [action?.id]);

  if (!action) return null;

  const addCase = () =>
    setCfg((c) => ({
      ...c,
      cases: [
        ...c.cases,
        { id: newCaseId(), label: `Caso ${c.cases.length + 1}`, match: { op: "equals", value: "" }, actions: [] },
      ],
    }));

  const updateCase = (id: string, patch: Partial<SwitchCase>) =>
    setCfg((c) => ({
      ...c,
      cases: c.cases.map((cc) => (cc.id === id ? { ...cc, ...patch } : cc)),
    }));

  const removeCase = (id: string) =>
    setCfg((c) => ({ ...c, cases: c.cases.filter((cc) => cc.id !== id) }));

  return (
    <Dialog open={!!action} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Split className="h-5 w-5 text-primary" />
            Roteamento · múltiplos caminhos
          </DialogTitle>
          <DialogDescription>
            Avalia um campo em ordem e executa o primeiro caso que combinar. Se nenhum bater, executa <b>Padrão</b>.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-md border border-border p-3 space-y-2">
            <Label className="text-xs">Campo avaliado</Label>
            <Select value={cfg.field} onValueChange={(v) => setCfg((c) => ({ ...c, field: v }))}>
              <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {FLOW_CONDITION_FIELDS.map((g) => (
                  <SelectGroup key={g.label}>
                    <SelectLabel>{g.label}</SelectLabel>
                    {g.fields.map((f) => (
                      <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
                    ))}
                  </SelectGroup>
                ))}
              </SelectContent>
            </Select>
          </div>

          {cfg.cases.length === 0 ? (
            <div className="text-xs text-muted-foreground text-center py-3 border border-dashed border-border rounded-md">
              Nenhum caso ainda. Adicione ao menos um.
            </div>
          ) : (
            <SortableList
              items={cfg.cases}
              onReorder={(next) => setCfg((c) => ({ ...c, cases: next }))}
              className="space-y-2"
              renderItem={(cc, handle, i) => (
                <CaseCard
                  handle={handle}
                  index={i}
                  cc={cc}
                  stages={stages}
                  onChange={(patch) => updateCase(cc.id, patch)}
                  onRemove={() => removeCase(cc.id)}
                />
              )}
            />
          )}

          <Button size="sm" variant="ghost" onClick={addCase}>
            <Plus className="h-3.5 w-3.5 mr-1" /> Adicionar caso
          </Button>

          <div className="rounded-md border border-border p-3 space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs flex items-center gap-2">
                <Badge variant="outline" className="text-[10px]">padrão</Badge>
                Executado se nenhum caso combinar
              </Label>
              <span className="text-[11px] text-muted-foreground">{cfg.default.actions.length} ação(ões)</span>
            </div>
            <SortableActionList
              items={cfg.default.actions}
              stages={stages}
              onChange={(items) => setCfg((c) => ({ ...c, default: { actions: items } }))}
              emptyLabel="Sem ações no padrão — se nenhum caso combinar, o fluxo apenas segue."
              disallowNested
            />
          </div>

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

function CaseCard({
  handle,
  index,
  cc,
  stages,
  onChange,
  onRemove,
}: {
  handle: React.ReactNode;
  index: number;
  cc: SwitchCase;
  stages: PipelineStage[];
  onChange: (p: Partial<SwitchCase>) => void;
  onRemove: () => void;
}) {
  const [open, setOpen] = useState(index === 0);
  const needsValue = OPS_NEEDING_VALUE.includes(cc.match.op);
  return (
    <Collapsible open={open} onOpenChange={setOpen} className="rounded-md border border-border bg-card/40">
      <div className="flex items-center gap-2 p-2">
        {handle}
        <Badge variant="outline" className="text-[10px]">{index + 1}</Badge>
        <CollapsibleTrigger asChild>
          <button className="flex-1 flex items-center gap-2 min-w-0 text-left">
            <ChevronDown className={`h-4 w-4 transition-transform ${open ? "" : "-rotate-90"}`} />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium truncate">{cc.label || "(sem rótulo)"}</div>
              <div className="text-[11px] text-muted-foreground truncate">
                {OP_LABELS[cc.match.op]} {needsValue ? `"${cc.match.value || "—"}"` : ""} · {cc.actions.length} ação(ões)
              </div>
            </div>
          </button>
        </CollapsibleTrigger>
        <Button variant="ghost" size="icon" onClick={onRemove}>
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
      <CollapsibleContent className="p-3 pt-0 space-y-3">
        <div className="grid grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)] gap-2">
          <div className="space-y-1">
            <Label className="text-[11px]">Rótulo</Label>
            <Input
              value={cc.label}
              onChange={(e) => onChange({ label: e.target.value })}
              className="h-9 text-xs"
              placeholder="Ex.: Instagram"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-[11px]">Operador</Label>
            <Select
              value={cc.match.op}
              onValueChange={(v) => onChange({ match: { ...cc.match, op: v as ConditionOp } })}
            >
              <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {(Object.keys(OP_LABELS) as ConditionOp[]).map((op) => (
                  <SelectItem key={op} value={op}>{OP_LABELS[op]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-[11px]">Valor</Label>
            <Input
              disabled={!needsValue}
              placeholder={needsValue ? "valor" : "—"}
              value={cc.match.value ?? ""}
              onChange={(e) => onChange({ match: { ...cc.match, value: e.target.value } })}
              className="h-9 text-xs"
            />
          </div>
        </div>
        <SortableActionList
          items={cc.actions}
          stages={stages}
          onChange={(items) => onChange({ actions: items })}
          emptyLabel="Sem ações neste caso."
          disallowNested
        />
      </CollapsibleContent>
    </Collapsible>
  );
}
