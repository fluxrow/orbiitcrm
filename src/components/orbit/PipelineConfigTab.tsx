import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { ArrowDown, ArrowUp, Loader2, Pencil, Plus, Sparkles, Trash2 } from "lucide-react";
import {
  usePipelineStages,
  usePipelineTemplates,
  useUpsertStage,
  useArchiveStage,
  useReorderStages,
  useApplyTemplate,
  type PipelineStage,
} from "@/hooks/useOrbitPipelineConfig";

const TIPO_OPTS = [
  { value: "open", label: "Aberta" },
  { value: "won", label: "Ganho" },
  { value: "lost", label: "Perdido" },
];

function stageTipo(s: PipelineStage): "open" | "won" | "lost" {
  if (s.is_won) return "won";
  if (s.is_lost) return "lost";
  return "open";
}

export function PipelineConfigTab() {
  const { data: stages, isLoading } = usePipelineStages();
  const { data: templates } = usePipelineTemplates();
  const upsert = useUpsertStage();
  const archive = useArchiveStage();
  const reorder = useReorderStages();
  const applyTpl = useApplyTemplate();

  const [editing, setEditing] = useState<Partial<PipelineStage> | null>(null);
  const [tplId, setTplId] = useState<string>("");
  const [tplReplace, setTplReplace] = useState(false);

  const move = (idx: number, dir: -1 | 1) => {
    if (!stages) return;
    const next = [...stages];
    const target = idx + dir;
    if (target < 0 || target >= next.length) return;
    [next[idx], next[target]] = [next[target], next[idx]];
    reorder.mutate(next.map((s) => s.id));
  };

  const handleSave = () => {
    if (!editing?.nome?.trim()) return;
    const tipo = (editing as any)._tipo as string | undefined;
    const payload: any = {
      id: editing.id,
      nome: editing.nome,
      descricao: editing.descricao ?? null,
      cor: editing.cor || "#3b82f6",
      probabilidade_default: editing.probabilidade_default ?? null,
      sla_dias: editing.sla_dias ?? null,
      requer_motivo: !!editing.requer_motivo,
      is_won: tipo === "won",
      is_lost: tipo === "lost",
      ordem: editing.ordem ?? (stages?.length ?? 0) + 1,
    };
    upsert.mutate(payload, { onSuccess: () => setEditing(null) });
  };

  return (
    <div className="space-y-6">
      {/* Templates */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            <CardTitle>Templates de Pipeline</CardTitle>
          </div>
          <CardDescription>
            Aplique um modelo pronto por vertical. Modo padrão é aditivo — não apaga etapas existentes.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_auto] gap-3 items-end">
            <div className="space-y-1">
              <Label>Template</Label>
              <Select value={tplId} onValueChange={setTplId}>
                <SelectTrigger><SelectValue placeholder="Escolha um template" /></SelectTrigger>
                <SelectContent>
                  {(templates || []).map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.nome}{t.is_system ? " · sistema" : ""}{t.vertical ? ` · ${t.vertical}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <Switch id="tpl-replace" checked={tplReplace} onCheckedChange={setTplReplace} />
              <Label htmlFor="tpl-replace" className="text-sm">Substituir etapas atuais</Label>
            </div>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button disabled={!tplId || applyTpl.isPending}>
                  {applyTpl.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Sparkles className="h-4 w-4 mr-2" />}
                  Aplicar
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Aplicar template?</AlertDialogTitle>
                  <AlertDialogDescription>
                    {tplReplace
                      ? "As etapas atuais serão arquivadas e substituídas pelas do template. Deals existentes mantêm referência mas ficam em etapas arquivadas."
                      : "As etapas do template serão adicionadas ao final do pipeline atual. Nada será apagado."}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  <AlertDialogAction onClick={() => applyTpl.mutate({ templateId: tplId, replace: tplReplace })}>
                    Confirmar
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </CardContent>
      </Card>

      {/* Stages */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Etapas do Pipeline</CardTitle>
              <CardDescription>Configure as etapas usadas no funil de vendas desta empresa.</CardDescription>
            </div>
            <Button onClick={() => setEditing({ cor: "#3b82f6" })}>
              <Plus className="h-4 w-4 mr-2" />Nova Etapa
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>
          ) : !stages || stages.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              Nenhuma etapa configurada. Aplique um template ou crie a primeira etapa.
            </p>
          ) : (
            <div className="space-y-2">
              {stages.map((s, idx) => {
                const tipo = stageTipo(s);
                return (
                  <div key={s.id} className="flex items-center gap-3 p-3 rounded-lg border bg-card">
                    <div className="flex flex-col gap-1">
                      <Button size="icon" variant="ghost" className="h-6 w-6" disabled={idx === 0} onClick={() => move(idx, -1)}>
                        <ArrowUp className="h-3 w-3" />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-6 w-6" disabled={idx === stages.length - 1} onClick={() => move(idx, 1)}>
                        <ArrowDown className="h-3 w-3" />
                      </Button>
                    </div>
                    <div className="h-8 w-2 rounded" style={{ background: s.cor || "#3b82f6" }} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium truncate">{s.nome}</span>
                        <Badge variant={tipo === "won" ? "default" : tipo === "lost" ? "destructive" : "secondary"}>
                          {tipo}
                        </Badge>
                        {s.probabilidade_default != null && (
                          <Badge variant="outline">{s.probabilidade_default}%</Badge>
                        )}
                        {s.sla_dias != null && (
                          <Badge variant="outline">SLA {s.sla_dias}d</Badge>
                        )}
                        {s.requer_motivo && <Badge variant="outline">motivo obrigatório</Badge>}
                      </div>
                      {s.descricao && <p className="text-xs text-muted-foreground mt-1 truncate">{s.descricao}</p>}
                    </div>
                    <Button size="icon" variant="ghost" onClick={() => setEditing({ ...s, ...({ _tipo: tipo } as any) })}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button size="icon" variant="ghost"><Trash2 className="h-4 w-4 text-destructive" /></Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Arquivar etapa "{s.nome}"?</AlertDialogTitle>
                          <AlertDialogDescription>
                            A etapa deixa de aparecer no funil. Deals existentes preservam o vínculo histórico.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancelar</AlertDialogCancel>
                          <AlertDialogAction onClick={() => archive.mutate(s.id)}>Arquivar</AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Edit dialog */}
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing?.id ? "Editar etapa" : "Nova etapa"}</DialogTitle>
          </DialogHeader>
          {editing && (
            <div className="space-y-4">
              <div className="space-y-1">
                <Label>Nome *</Label>
                <Input
                  value={editing.nome || ""}
                  onChange={(e) => setEditing({ ...editing, nome: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <Label>Descrição</Label>
                <Textarea
                  value={editing.descricao || ""}
                  onChange={(e) => setEditing({ ...editing, descricao: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Tipo</Label>
                  <Select
                    value={(editing as any)._tipo || stageTipo(editing as PipelineStage)}
                    onValueChange={(v) => setEditing({ ...editing, ...({ _tipo: v } as any) })}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {TIPO_OPTS.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Cor</Label>
                  <Input type="color" value={editing.cor || "#3b82f6"} onChange={(e) => setEditing({ ...editing, cor: e.target.value })} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Probabilidade (%)</Label>
                  <Input type="number" min={0} max={100}
                    value={editing.probabilidade_default ?? ""}
                    onChange={(e) => setEditing({ ...editing, probabilidade_default: e.target.value === "" ? null : parseInt(e.target.value) })}
                  />
                </div>
                <div className="space-y-1">
                  <Label>SLA (dias)</Label>
                  <Input type="number" min={0}
                    value={editing.sla_dias ?? ""}
                    onChange={(e) => setEditing({ ...editing, sla_dias: e.target.value === "" ? null : parseInt(e.target.value) })}
                  />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Switch id="req-motivo" checked={!!editing.requer_motivo}
                  onCheckedChange={(v) => setEditing({ ...editing, requer_motivo: v })} />
                <Label htmlFor="req-motivo">Exigir motivo ao mover deal para esta etapa</Label>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={upsert.isPending}>
              {upsert.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
