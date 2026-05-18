import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, FileSpreadsheet, Link2, ChevronDown, ChevronUp } from "lucide-react";
import { toast } from "sonner";
import { useImportHistory, useBackfillImportAsList, buildListaTagFromImport } from "@/hooks/useOrbitProspects";

interface Props {
  empresaId: string | null | undefined;
}

export function ImportHistoryPanel({ empresaId }: Props) {
  const { data: history, isLoading } = useImportHistory(empresaId);
  const backfill = useBackfillImportAsList();
  const [open, setOpen] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  if (!empresaId) return null;
  if (!isLoading && (!history || history.length === 0)) return null;

  const handleBackfill = async (importId: string, arquivoNome: string) => {
    if (!empresaId) return;
    setBusyId(importId);
    try {
      const res = await backfill.mutateAsync({ importId, empresaId });
      if (res.tagged === 0 && res.alreadyTagged === 0 && res.candidates === 0) {
        toast.warning("Nenhum prospect encontrado nesta janela para vincular.");
      } else {
        toast.success(
          `Lista "${arquivoNome}" vinculada: ${res.tagged} marcados${res.alreadyTagged ? ` · ${res.alreadyTagged} já estavam` : ""}.`
        );
      }
      if (res.errors.length) toast.warning(`${res.errors.length} erro(s) durante a marcação.`);
    } catch (e: any) {
      toast.error(e.message || "Falha ao vincular lista.");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Card className="mb-4">
      <CardContent className="p-3">
        <button
          onClick={() => setOpen(o => !o)}
          className="w-full flex items-center justify-between text-sm font-medium"
        >
          <span className="flex items-center gap-2">
            <FileSpreadsheet className="h-4 w-4 text-primary" />
            Importações recentes ({history?.length || 0})
          </span>
          {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>

        {open && (
          <div className="mt-3 space-y-2">
            {(history || []).map(h => {
              const tag = buildListaTagFromImport(h.arquivo_nome, h.created_at);
              const label = tag.replace(/^lista:/, "");
              return (
                <div key={h.id} className="flex items-center gap-3 rounded-md border border-border/60 p-2 text-sm">
                  <div className="flex-1 min-w-0">
                    <p className="truncate font-medium">{h.arquivo_nome}</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(h.created_at).toLocaleString("pt-BR")} · {h.sucesso}/{h.total_registros} sucesso
                    </p>
                  </div>
                  <Badge variant="secondary" className="text-[10px] hidden md:inline-flex truncate max-w-[260px]">{label}</Badge>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busyId === h.id}
                    onClick={() => handleBackfill(h.id, h.arquivo_nome)}
                  >
                    {busyId === h.id ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Link2 className="h-3 w-3 mr-1" />}
                    Vincular como lista
                  </Button>
                </div>
              );
            })}
            <p className="text-xs text-muted-foreground">
              Use este botão para importações antigas — listas novas (importadas a partir de agora) já são vinculadas automaticamente.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
