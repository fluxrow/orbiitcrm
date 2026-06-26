import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertCircle, CheckCircle2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { useOrbitLeadSources } from "@/hooks/useOrbitLeadSources";
import type { OrbitFlow } from "@/hooks/useOrbitFlows";

type PayloadMatch = { key: string; value: string };

type Conditions = {
  source_id?: string;
  source_tipo?: string;
  only_new?: boolean;
  require_telefone?: boolean;
  require_email?: boolean;
  require_documento?: boolean;
  payload_match?: Record<string, string | string[]>;
};

export function FlowConditionsDialog({
  flow,
  empresaId,
  onClose,
}: {
  flow: OrbitFlow | null;
  empresaId: string;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const { data: sources } = useOrbitLeadSources(empresaId);
  const [cond, setCond] = useState<Conditions>({});
  const [payloadRows, setPayloadRows] = useState<PayloadMatch[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!flow) return;
    const c = (flow.condicoes ?? {}) as Conditions;
    setCond(c);
    const rows: PayloadMatch[] = Object.entries(c.payload_match ?? {}).map(([key, value]) => ({
      key,
      value: Array.isArray(value) ? value.join(", ") : String(value),
    }));
    setPayloadRows(rows);
  }, [flow?.id]);

  const isLeadRecebido = flow?.trigger_type === "lead_recebido";

  // Validações em tempo real
  const validation = useMemo(() => {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (isLeadRecebido && cond.source_id) {
      const valid = (sources ?? []).some((s) => s.id === cond.source_id);
      if (!valid) errors.push("source_id selecionado não existe nesta empresa.");
    }

    for (const row of payloadRows) {
      if (row.key && !/^[a-zA-Z0-9_.]+$/.test(row.key)) {
        errors.push(`Chave "${row.key}" tem caracteres inválidos (use letras, números, _ ou .).`);
      }
      if (row.key && row.value === "") {
        warnings.push(`Chave "${row.key}" está sem valor — será ignorada.`);
      }
      if (!row.key && row.value) {
        errors.push("Há um valor de payload sem chave definida.");
      }
    }

    if (isLeadRecebido && !cond.source_id && !cond.source_tipo && payloadRows.length === 0 && !cond.require_telefone && !cond.require_email && !cond.require_documento) {
      warnings.push("Sem condições: o fluxo vai disparar para TODOS os leads recebidos.");
    }

    return { errors, warnings, valid: errors.length === 0 };
  }, [cond, payloadRows, sources, isLeadRecebido]);

  const handleSave = async () => {
    if (!flow) return;
    if (!validation.valid) {
      toast.error("Corrija os erros antes de salvar");
      return;
    }
    setSaving(true);
    const payloadMatch: Record<string, string | string[]> = {};
    for (const row of payloadRows) {
      if (!row.key || !row.value) continue;
      if (row.value.includes(",")) {
        payloadMatch[row.key] = row.value.split(",").map((v) => v.trim()).filter(Boolean);
      } else {
        payloadMatch[row.key] = row.value.trim();
      }
    }
    const next: Conditions = {
      ...cond,
      payload_match: Object.keys(payloadMatch).length ? payloadMatch : undefined,
    };
    // remover chaves vazias
    Object.keys(next).forEach((k) => {
      const v = (next as any)[k];
      if (v === "" || v === undefined || v === null || v === false) delete (next as any)[k];
    });
    const { error } = await (supabase.from("orbit_flows" as any) as any)
      .update({ condicoes: next })
      .eq("id", flow.id);
    setSaving(false);
    if (error) {
      toast.error(`Erro: ${error.message}`);
      return;
    }
    toast.success("Condições atualizadas");
    qc.invalidateQueries({ queryKey: ["orbit-flows"] });
    onClose();
  };

  if (!flow) return null;

  return (
    <Dialog open={!!flow} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Condições do fluxo</DialogTitle>
          <DialogDescription>
            {flow.nome} · Trigger: <code className="text-xs">{flow.trigger_type}</code>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {isLeadRecebido && (
            <>
              <div className="space-y-2">
                <Label>Filtrar por Fonte de Lead</Label>
                <Select
                  value={cond.source_id ?? "__any__"}
                  onValueChange={(v) =>
                    setCond((c) => ({ ...c, source_id: v === "__any__" ? undefined : v }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Qualquer fonte" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__any__">Qualquer fonte</SelectItem>
                    {(sources ?? []).map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.nome} <span className="text-muted-foreground ml-1">({s.tipo})</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Filtrar por tipo de fonte</Label>
                <Select
                  value={cond.source_tipo ?? "__any__"}
                  onValueChange={(v) =>
                    setCond((c) => ({ ...c, source_tipo: v === "__any__" ? undefined : v }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Qualquer tipo" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__any__">Qualquer tipo</SelectItem>
                    <SelectItem value="typebot">Typebot</SelectItem>
                    <SelectItem value="google_sheets">Google Sheets</SelectItem>
                    <SelectItem value="webhook">Webhook</SelectItem>
                    <SelectItem value="form">Formulário</SelectItem>
                    <SelectItem value="outro">Outro</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2 rounded-md border border-border p-3">
                <Label className="text-sm">Filtros adicionais</Label>
                <div className="flex items-center justify-between text-xs">
                  <span>Apenas leads novos (ignorar merges)</span>
                  <Switch
                    checked={!!cond.only_new}
                    onCheckedChange={(v) => setCond((c) => ({ ...c, only_new: v }))}
                  />
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span>Exigir telefone</span>
                  <Switch
                    checked={!!cond.require_telefone}
                    onCheckedChange={(v) => setCond((c) => ({ ...c, require_telefone: v }))}
                  />
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span>Exigir email</span>
                  <Switch
                    checked={!!cond.require_email}
                    onCheckedChange={(v) => setCond((c) => ({ ...c, require_email: v }))}
                  />
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span>Exigir documento (CPF/CNPJ)</span>
                  <Switch
                    checked={!!cond.require_documento}
                    onCheckedChange={(v) => setCond((c) => ({ ...c, require_documento: v }))}
                  />
                </div>
              </div>
            </>
          )}

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Filtros por chave do payload</Label>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setPayloadRows((r) => [...r, { key: "", value: "" }])}
              >
                <Plus className="h-3.5 w-3.5 mr-1" />
                Adicionar
              </Button>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Use prefixo <code>raw.</code> para chaves do payload original. Para múltiplos valores
              aceitos, separe por vírgula.
            </p>
            {payloadRows.length === 0 ? (
              <div className="text-xs text-muted-foreground py-2">Nenhum filtro de payload.</div>
            ) : (
              <div className="space-y-2">
                {payloadRows.map((row, i) => (
                  <div key={i} className="grid grid-cols-[1fr_1fr_auto] gap-2">
                    <Input
                      placeholder="raw.utm_source"
                      value={row.key}
                      onChange={(e) =>
                        setPayloadRows((rs) =>
                          rs.map((r, j) => (j === i ? { ...r, key: e.target.value } : r))
                        )
                      }
                      className="font-mono text-xs"
                    />
                    <Input
                      placeholder="instagram, facebook"
                      value={row.value}
                      onChange={(e) =>
                        setPayloadRows((rs) =>
                          rs.map((r, j) => (j === i ? { ...r, value: e.target.value } : r))
                        )
                      }
                      className="font-mono text-xs"
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setPayloadRows((rs) => rs.filter((_, j) => j !== i))}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Feedback em tempo real */}
          <div className="space-y-1">
            {validation.errors.map((e, i) => (
              <div key={`e-${i}`} className="flex items-start gap-2 text-xs text-red-400">
                <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                <span>{e}</span>
              </div>
            ))}
            {validation.warnings.map((w, i) => (
              <div key={`w-${i}`} className="flex items-start gap-2 text-xs text-amber-400">
                <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                <span>{w}</span>
              </div>
            ))}
            {validation.valid && validation.warnings.length === 0 && (
              <div className="flex items-center gap-2 text-xs text-green-400">
                <CheckCircle2 className="h-3.5 w-3.5" />
                <span>Configuração válida.</span>
              </div>
            )}
          </div>

          <details className="text-[11px] text-muted-foreground">
            <summary className="cursor-pointer">Preview JSON</summary>
            <pre className="mt-2 p-2 bg-muted/40 rounded border border-border overflow-x-auto">
              {JSON.stringify(cond, null, 2)}
            </pre>
          </details>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            onClick={handleSave}
            disabled={saving || !validation.valid}
            className="bg-brand text-brand-foreground hover:bg-brand/90"
          >
            {saving ? "Salvando..." : "Salvar condições"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
