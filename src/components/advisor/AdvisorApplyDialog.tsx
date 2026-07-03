import { useState } from "react";
import { AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  useAdvisorApplyPreview,
  useAdvisorApplyConfirm,
  type AdvisorSuggestion,
} from "@/hooks/useAdvisorSuggestions";
import { useEffect } from "react";

type Props = {
  suggestion: AdvisorSuggestion | null;
  onClose: () => void;
};

export function AdvisorApplyDialog({ suggestion, onClose }: Props) {
  const preview = useAdvisorApplyPreview();
  const confirm = useAdvisorApplyConfirm();
  const [previewData, setPreviewData] = useState<any>(null);

  useEffect(() => {
    if (!suggestion) {
      setPreviewData(null);
      return;
    }
    preview.mutate(suggestion.id, {
      onSuccess: (data) => setPreviewData(data?.preview ?? null),
      onError: () => setPreviewData({ error: true }),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [suggestion?.id]);

  const isLoading = preview.isPending;
  const hasError = !!preview.error || previewData?.error;

  async function handleConfirm() {
    if (!suggestion) return;
    await confirm.mutateAsync(suggestion.id).catch(() => {});
    onClose();
  }

  return (
    <Dialog open={!!suggestion} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            Aplicar sugestão do Advisor
            {suggestion && (
              <Badge variant="outline" className="text-[10px]">
                {suggestion.action?.kind}
              </Badge>
            )}
          </DialogTitle>
          <DialogDescription className="text-sm">
            {suggestion?.titulo}
          </DialogDescription>
        </DialogHeader>

        {isLoading && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-8 justify-center">
            <Loader2 className="h-4 w-4 animate-spin" /> Preparando preview…
          </div>
        )}

        {hasError && !isLoading && (
          <div className="flex items-center gap-2 text-sm text-destructive py-4">
            <AlertTriangle className="h-4 w-4" />
            Não foi possível preparar o preview.{" "}
            {(preview.error as any)?.message ?? ""}
          </div>
        )}

        {previewData && !previewData.error && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground leading-relaxed">
              {previewData.description}
            </p>

            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-md border border-border p-3 bg-muted/30">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">
                  Antes
                </p>
                <pre className="text-xs whitespace-pre-wrap break-all font-mono">
                  {JSON.stringify(previewData.before, null, 2)}
                </pre>
              </div>
              <div className="rounded-md border border-primary/40 p-3 bg-primary/5">
                <p className="text-[10px] uppercase tracking-wide text-primary mb-1">
                  Depois
                </p>
                <pre className="text-xs whitespace-pre-wrap break-all font-mono">
                  {JSON.stringify(previewData.after, null, 2)}
                </pre>
              </div>
            </div>

            <div className="text-[11px] text-muted-foreground border-t border-border pt-3">
              <span className="font-medium text-foreground">Alvo:</span>{" "}
              {previewData.target_table} · {previewData.target_label ?? previewData.target_id}
            </div>
          </div>
        )}

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={isLoading || hasError || confirm.isPending}
          >
            {confirm.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <CheckCircle2 className="h-4 w-4 mr-2" />
            )}
            Confirmar aplicação
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
