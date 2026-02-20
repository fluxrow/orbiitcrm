import { useState } from "react";
import { useInteracoesPaginated } from "@/hooks/useInteracoes";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Plus, Phone, Mail, MessageSquare, Calendar, FileText, List, Clock, Loader2 } from "lucide-react";
import { InteracaoDialog } from "@/components/pe-admin/InteracaoDialog";

const TIPO_ICONS: Record<string, any> = {
  call: Phone, email: Mail, whatsapp: MessageSquare, meeting: Calendar, note: FileText,
};

const TIPO_DOT_COLORS: Record<string, string> = {
  call: "bg-blue-500",
  email: "bg-green-500",
  whatsapp: "bg-emerald-500",
  meeting: "bg-purple-500",
  note: "bg-gray-400",
};

const TIPO_LABELS: Record<string, string> = {
  call: "Ligação", email: "E-mail", whatsapp: "WhatsApp", meeting: "Reunião", note: "Nota",
};

interface Props {
  oportunidade: any;
}

export function InteracoesTab({ oportunidade }: Props) {
  const {
    data,
    isLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInteracoesPaginated({ oportunidade_id: oportunidade.id });
  const interacoes = data?.pages.flatMap((p) => p) ?? [];
  const [dialogOpen, setDialogOpen] = useState(false);
  const [viewMode, setViewMode] = useState<"timeline" | "list">("timeline");

  const formatDateTime = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }) +
      " " + d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex gap-1">
          <Button
            variant={viewMode === "timeline" ? "default" : "ghost"}
            size="icon"
            className="h-8 w-8"
            onClick={() => setViewMode("timeline")}
            title="Timeline"
          >
            <Clock className="w-4 h-4" />
          </Button>
          <Button
            variant={viewMode === "list" ? "default" : "ghost"}
            size="icon"
            className="h-8 w-8"
            onClick={() => setViewMode("list")}
            title="Lista"
          >
            <List className="w-4 h-4" />
          </Button>
        </div>
        <Button size="sm" onClick={() => setDialogOpen(true)}>
          <Plus className="w-4 h-4 mr-2" />Nova Interação
        </Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-8">
          <div className="animate-spin w-6 h-6 border-4 border-primary border-t-transparent rounded-full" />
        </div>
      ) : (!interacoes || interacoes.length === 0) ? (
        <p className="text-center py-6 text-muted-foreground">Nenhuma interação registrada</p>
      ) : (
        <>
          {viewMode === "timeline" ? (
        <div className="relative pl-6">
          {/* Vertical line */}
          <div className="absolute left-[11px] top-2 bottom-2 w-0.5 bg-muted" />

          <div className="space-y-6">
            {interacoes.map((i: any) => {
              const Icon = TIPO_ICONS[i.tipo] || FileText;
              const dotColor = TIPO_DOT_COLORS[i.tipo] || "bg-gray-400";
              return (
                <div key={i.id} className="relative">
                  {/* Dot */}
                  <div className={`absolute -left-6 top-1 w-3 h-3 rounded-full ring-2 ring-background ${dotColor}`} />

                  <div className="space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Icon className="w-3.5 h-3.5 text-muted-foreground" />
                      <Badge variant="outline" className="text-xs">
                        {TIPO_LABELS[i.tipo] || i.tipo}
                      </Badge>
                      <span className="text-xs font-medium text-muted-foreground">
                        {formatDateTime(i.data_interacao)}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        por {(i.pe_users as any)?.full_name || "—"}
                      </span>
                    </div>
                    <p className="text-sm">{i.resumo}</p>

                    {(i.proxima_acao || i.data_followup) && (
                      <div className="mt-1.5 rounded-md bg-amber-50 dark:bg-amber-950/30 border-l-2 border-amber-400 p-2 text-xs space-y-0.5">
                        {i.proxima_acao && (
                          <p className="text-amber-800 dark:text-amber-300">
                            <span className="font-medium">Próxima ação:</span> {i.proxima_acao}
                          </p>
                        )}
                        {i.data_followup && (
                          <p className="text-amber-700 dark:text-amber-400">
                            <span className="font-medium">Follow-up:</span>{" "}
                            {new Date(i.data_followup).toLocaleDateString("pt-BR")}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
          ) : (
            /* ── List View (original) ── */
            <div className="space-y-3">
              {interacoes.map((i: any) => {
                const Icon = TIPO_ICONS[i.tipo] || FileText;
                return (
                  <Card key={i.id}>
                    <CardContent className="p-4 flex gap-3">
                      <div className="mt-1"><Icon className="w-4 h-4 text-muted-foreground" /></div>
                      <div className="flex-1 space-y-1">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="text-xs">{i.tipo}</Badge>
                          <span className="text-xs text-muted-foreground">
                            {new Date(i.data_interacao).toLocaleDateString("pt-BR")}
                          </span>
                          <span className="text-xs text-muted-foreground">por {(i.pe_users as any)?.full_name || "—"}</span>
                        </div>
                        <p className="text-sm">{i.resumo}</p>
                        {i.proxima_acao && <p className="text-xs text-muted-foreground">Próxima ação: {i.proxima_acao}</p>}
                        {i.data_followup && <p className="text-xs text-muted-foreground">Follow-up: {i.data_followup}</p>}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}

          {hasNextPage && (
            <div className="flex justify-center pt-4">
              <Button
                variant="outline"
                size="sm"
                onClick={() => fetchNextPage()}
                disabled={isFetchingNextPage}
              >
                {isFetchingNextPage ? (
                  <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Carregando...</>
                ) : (
                  "Carregar mais interações"
                )}
              </Button>
            </div>
          )}
        </>
      )}

      <InteracaoDialog open={dialogOpen} onOpenChange={setDialogOpen} oportunidade={oportunidade} />
    </div>
  );
}
