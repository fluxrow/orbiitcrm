import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { GitBranch, Play, Sparkles } from "lucide-react";
import { useFlowEventMap, useTriggerTestEvent } from "@/hooks/useFlowEventMap";
import { toast } from "sonner";

export function FlowEventMap({ empresaId }: { empresaId: string }) {
  const { data: entries, isLoading, refetch } = useFlowEventMap(empresaId);
  const test = useTriggerTestEvent();

  return (
    <Card className="glass-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <GitBranch className="h-5 w-5 text-brand" />
          Mapa de Disparo
        </CardTitle>
        <CardDescription>
          Visualize quais fluxos escutam cada evento do CRM. Use "Testar" para injetar um evento sintético e validar o motor.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="text-sm text-muted-foreground">Carregando mapa...</div>
        ) : (
          <div className="space-y-3">
            {entries.map((entry) => {
              const activeFlows = entry.flows.filter((f) => f.ativo);
              const hasAny = entry.flows.length > 0;
              return (
                <div
                  key={entry.type}
                  className="rounded-lg border border-border/60 bg-card/40 p-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium">{entry.label}</span>
                        <code className="text-[10px] bg-muted/60 px-1.5 py-0.5 rounded text-muted-foreground">
                          {entry.type}
                        </code>
                        {hasAny ? (
                          <Badge className="bg-brand/20 text-brand border-brand/30 text-[10px]">
                            <Sparkles className="h-3 w-3 mr-1" />
                            {activeFlows.length} ativo{activeFlows.length === 1 ? "" : "s"}
                            {entry.flows.length > activeFlows.length
                              ? ` · ${entry.flows.length - activeFlows.length} pausado`
                              : ""}
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-[10px] text-muted-foreground">
                            Nenhum fluxo escutando
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">{entry.description}</p>
                    </div>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          size="sm"
                          variant="outline"
                          className="shrink-0 border-brand/40 text-brand hover:bg-brand/10 hover:text-brand"
                          disabled={test.isPending}
                          onClick={() =>
                            test.mutate(
                              { empresaId, eventType: entry.type, entityType: entry.entityType },
                              {
                                onSuccess: () => {
                                  toast.success(`Evento sintético "${entry.label}" enfileirado`);
                                  setTimeout(() => refetch(), 1500);
                                },
                                onError: (e: any) => toast.error(`Falha: ${e.message}`),
                              }
                            )
                          }
                        >
                          <Play className="h-3.5 w-3.5 mr-1" />
                          Testar
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        Insere um evento sintético na fila (payload <code>is_test:true</code>) e invoca o dispatcher.
                      </TooltipContent>
                    </Tooltip>
                  </div>

                  {hasAny && (
                    <div className="mt-2 pl-2 border-l-2 border-brand/30 space-y-1">
                      {entry.flows.map((f) => (
                        <div key={f.id} className="flex items-center gap-2 text-xs">
                          <span
                            className={`h-1.5 w-1.5 rounded-full ${
                              f.ativo ? "bg-brand" : "bg-muted-foreground/40"
                            }`}
                          />
                          <span className={f.ativo ? "text-foreground" : "text-muted-foreground"}>
                            {f.nome}
                          </span>
                          {Object.keys(f.condicoes ?? {}).length > 0 && (
                            <span className="text-[10px] text-muted-foreground">
                              · {Object.keys(f.condicoes).length} condição(ões)
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
