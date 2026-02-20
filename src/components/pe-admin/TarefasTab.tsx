import { useState } from "react";
import { useTarefas, useMarkTarefaDone } from "@/hooks/useTarefas";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Plus } from "lucide-react";
import { TarefaDialog } from "@/components/pe-admin/TarefaDialog";

const PRIORIDADE_COLORS: Record<string, "default" | "secondary" | "destructive"> = {
  low: "secondary", normal: "default", high: "destructive",
};

interface Props {
  oportunidade: any;
}

export function TarefasTab({ oportunidade }: Props) {
  const { data: tarefas, isLoading } = useTarefas({ oportunidade_id: oportunidade.id });
  const markDone = useMarkTarefaDone();
  const [dialogOpen, setDialogOpen] = useState(false);

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button size="sm" onClick={() => setDialogOpen(true)}>
          <Plus className="w-4 h-4 mr-2" />Nova Tarefa
        </Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-8">
          <div className="animate-spin w-6 h-6 border-4 border-primary border-t-transparent rounded-full" />
        </div>
      ) : (
        <div className="space-y-2">
          {(tarefas || []).map((t: any) => (
            <div key={t.id} className="flex items-start gap-3 p-3 border rounded-lg">
              <Checkbox
                checked={t.status === "done"}
                onCheckedChange={() => {
                  if (t.status !== "done") markDone.mutate({ id: t.id, organization_id: t.organization_id });
                }}
                className="mt-1"
              />
              <div className="flex-1 space-y-1">
                <p className={`text-sm font-medium ${t.status === "done" ? "line-through text-muted-foreground" : ""}`}>{t.titulo}</p>
                {t.descricao && <p className="text-xs text-muted-foreground">{t.descricao}</p>}
                <div className="flex items-center gap-2">
                  <Badge variant={PRIORIDADE_COLORS[t.prioridade]}>{t.prioridade}</Badge>
                  {t.due_date && <span className="text-xs text-muted-foreground">Vence: {t.due_date}</span>}
                  <span className="text-xs text-muted-foreground">{(t.assigned as any)?.full_name || "—"}</span>
                </div>
              </div>
            </div>
          ))}
          {(!tarefas || tarefas.length === 0) && (
            <p className="text-center py-6 text-muted-foreground">Nenhuma tarefa</p>
          )}
        </div>
      )}

      <TarefaDialog open={dialogOpen} onOpenChange={setDialogOpen} oportunidade={oportunidade} />
    </div>
  );
}
