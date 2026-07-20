import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { AlertTriangle, Loader2, Undo2, Eye, PlayCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const CONFIRM_TEXT = "LIBERAR FLUXOS FUTUROS";

interface Props {
  empresaId: string;
  empresaNome: string;
}

type PreviewData = {
  definitions_would_enable: any[];
  definitions_disabled_excluded: any[];
  snapshot_summary: { total_pending_dry_run: number; by_category: Record<string, number> };
  snapshot_samples: Record<string, any[]>;
  rhythm?: { max_per_minute: number; daily_limit: number };
  truncated?: boolean;
};

export function FlowGoLiveReconcilePanel({ empresaId, empresaNome }: Props) {
  const { toast } = useToast();
  const [loading, setLoading] = useState<null | "preview" | "apply" | "rollback">(null);
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [applyOpen, setApplyOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [confirmChecked, setConfirmChecked] = useState(false);
  const [operationId, setOperationId] = useState<string>("");
  const [lastApply, setLastApply] = useState<any>(null);
  const [rollbackOpen, setRollbackOpen] = useState(false);
  const [rollbackConflict, setRollbackConflict] = useState<string | null>(null);

  async function runPreview() {
    setLoading("preview");
    setPreview(null);
    try {
      const r = await supabase.functions.invoke("orbit-flow-go-live-reconcile", {
        body: { mode: "preview", empresa_id: empresaId },
      });
      if (r.error) throw new Error(r.error.message);
      setPreview((r.data as any)?.data ?? r.data);
    } catch (e: any) {
      toast({ title: "Falha no preview", description: e.message, variant: "destructive" });
    } finally {
      setLoading(null);
    }
  }

  function openApply() {
    setOperationId(`op_${empresaId.slice(0, 8)}_${Date.now()}_${crypto.randomUUID().slice(0, 6)}`);
    setConfirmText("");
    setConfirmChecked(false);
    setApplyOpen(true);
  }

  async function runApply() {
    setLoading("apply");
    try {
      const r = await supabase.functions.invoke("orbit-flow-go-live-reconcile", {
        body: {
          mode: "apply", empresa_id: empresaId, operation_id: operationId,
          confirm_text: CONFIRM_TEXT, authorized: true,
        },
      });
      // Guard failures agora retornam 409 (não-2xx) — precisamos extrair mensagem
      if (r.error) {
        const ctx: any = (r.error as any)?.context;
        let detail = r.error.message;
        try {
          if (ctx?.body) {
            const parsed = typeof ctx.body === "string" ? JSON.parse(ctx.body) : ctx.body;
            detail = parsed?.error?.message ?? detail;
          }
        } catch { /* noop */ }
        throw new Error(detail);
      }
      const data = (r.data as any)?.data ?? r.data;
      if (data?.error) throw new Error(data.error);
      setLastApply(data);
      toast({ title: "Apply concluído", description: `Ops: ${data?.summary?.definitions_enabled ?? 0} defs, ${data?.summary?.snapshots_rebased ?? 0} snapshots` });
      setApplyOpen(false);
      runPreview();
    } catch (e: any) {
      const msg = String(e.message ?? e);
      const isGuard = msg.includes("guard_revalidation_failed");
      toast({
        title: isGuard ? "Apply bloqueado por guard (TOCTOU)" : "Falha no apply",
        description: isGuard
          ? `Estado do prospect mudou entre preview e apply. Rode preview novamente. Detalhe: ${msg}`
          : msg,
        variant: "destructive",
      });
    } finally {
      setLoading(null);
    }
  }

  async function runRollback() {
    if (!lastApply?.operation_id) return;
    setLoading("rollback");
    setRollbackConflict(null);
    try {
      const r = await supabase.functions.invoke("orbit-flow-go-live-reconcile", {
        body: { mode: "rollback", operation_id: lastApply.operation_id },
      });
      if (r.error) throw new Error(r.error.message);
      const data = (r.data as any)?.data ?? r.data;
      if (data?.error) {
        if (String(data.error).includes("rollback_conflict")) {
          setRollbackConflict(data.error);
          return;
        }
        throw new Error(data.error);
      }
      toast({ title: "Rollback ok", description: `Restaurados: ${data?.restored ?? 0}` });
      setLastApply(null);
      setRollbackOpen(false);
      runPreview();
    } catch (e: any) {
      toast({ title: "Falha no rollback", description: e.message, variant: "destructive" });
    } finally {
      setLoading(null);
    }
  }

  const cats = preview?.snapshot_summary?.by_category ?? {};

  return (
    <div className="border-t pt-3 mt-2 space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Go-Live de Fluxos WhatsApp
          </div>
          <div className="text-xs text-muted-foreground">
            Esta etapa <b>não liga Z-API nem o adapter Outbox</b>. O canário vem depois.
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={runPreview} disabled={loading === "preview"}>
            {loading === "preview" ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Eye className="w-3 h-3 mr-1" />}
            Preview
          </Button>
          <Button
            size="sm"
            variant="default"
            disabled={!preview || (preview.snapshot_summary.by_category.eligible_rebase ?? 0) === 0 || preview.truncated}
            onClick={openApply}
          >
            <PlayCircle className="w-3 h-3 mr-1" />
            Aplicar…
          </Button>
          {lastApply?.operation_id && !lastApply?.already_rolled_back && (
            <Button size="sm" variant="destructive" onClick={() => setRollbackOpen(true)}>
              <Undo2 className="w-3 h-3 mr-1" />
              Rollback
            </Button>
          )}
        </div>
      </div>

      {preview && (
        <div className="text-xs bg-muted rounded p-3 space-y-2">
          {preview.truncated && (
            <div className="text-amber-600 flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" />
              Preview truncado (mais de 5000 snapshots). Aplicar está bloqueado até reduzir o backlog.
            </div>
          )}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            <Info label="Definições a promover" value={String(preview.definitions_would_enable.length)} />
            <Info label="Definições disabled (excluídas)" value={String(preview.definitions_disabled_excluded.length)} />
            <Info label="Snapshots pending dry_run" value={String(preview.snapshot_summary.total_pending_dry_run)} />
            <Info label="Ritmo" value={preview.rhythm ? `${preview.rhythm.max_per_minute}/min · ${preview.rhythm.daily_limit}/dia` : "—"} />
          </div>
          <div className="flex flex-wrap gap-2 pt-1">
            {Object.entries(cats).map(([k, v]) => (
              <Badge key={k} variant={k === "eligible_rebase" ? "default" : "secondary"}>
                {k}: {v as number}
              </Badge>
            ))}
          </div>
        </div>
      )}

      {lastApply?.operation_id && (
        <div className="text-xs bg-emerald-500/10 border border-emerald-500/30 rounded p-2">
          Última operação: <code>{lastApply.operation_id}</code>
          {" · "}defs: {lastApply.summary?.definitions_enabled ?? 0}
          {" · "}snapshots: {lastApply.summary?.snapshots_rebased ?? 0}
          {lastApply.already_applied ? " · (idempotente)" : ""}
        </div>
      )}

      {/* APPLY DIALOG */}
      <Dialog open={applyOpen} onOpenChange={(o) => !o && setApplyOpen(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-destructive flex items-center gap-2">
              <AlertTriangle className="w-5 h-5" /> Liberar fluxos futuros
            </DialogTitle>
            <DialogDescription>
              {empresaNome} · Esta etapa NÃO liga Z-API nem o adapter Outbox. Só promove
              definições e reagenda snapshots elegíveis.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <div>
              <Label>Digite <code>{CONFIRM_TEXT}</code></Label>
              <Input value={confirmText} onChange={(e) => setConfirmText(e.target.value)} />
            </div>
            <label className="flex items-start gap-2">
              <Checkbox checked={confirmChecked} onCheckedChange={(v) => setConfirmChecked(!!v)} />
              <span>Revisado. Autorizo esta operação para o tenant acima.</span>
            </label>
            <div className="text-xs text-muted-foreground">
              operation_id: <code>{operationId}</code>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setApplyOpen(false)}>Cancelar</Button>
            <Button
              variant="destructive"
              disabled={confirmText !== CONFIRM_TEXT || !confirmChecked || loading === "apply"}
              onClick={runApply}
            >
              {loading === "apply" ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : null}
              Liberar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ROLLBACK DIALOG */}
      <Dialog open={rollbackOpen} onOpenChange={(o) => !o && setRollbackOpen(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Undo2 className="w-5 h-5" /> Rollback da operação
            </DialogTitle>
            <DialogDescription>
              Reverte definições e snapshots ao estado anterior ao apply.
              Se houve mudança posterior (drift), a operação inteira é abortada.
            </DialogDescription>
          </DialogHeader>
          {rollbackConflict && (
            <div className="text-xs bg-destructive/10 border border-destructive/30 rounded p-2 text-destructive">
              <AlertTriangle className="w-3 h-3 inline mr-1" />
              {rollbackConflict}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setRollbackOpen(false)}>Cancelar</Button>
            <Button variant="destructive" onClick={runRollback} disabled={loading === "rollback"}>
              {loading === "rollback" ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : null}
              Executar rollback
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase text-muted-foreground">{label}</div>
      <div className="font-medium truncate">{value}</div>
    </div>
  );
}
