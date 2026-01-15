import {
  useEnrichmentQueue,
  useEnrichmentJobs,
  useEnrichmentCredits,
  useLeadFinderStats,
} from "@/hooks/useLeadFinder";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Coins,
  TrendingUp,
  Activity,
  RefreshCw,
  CheckCircle2,
  XCircle,
  Clock,
  AlertTriangle,
  Inbox,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

export function MonitorTab() {
  const stats = useLeadFinderStats();
  const { data: queue, isLoading: queueLoading, refetch: refetchQueue } = useEnrichmentQueue();
  const { data: jobs, isLoading: jobsLoading } = useEnrichmentJobs();

  // Calculate skip reasons
  const skipReasons = queue
    ?.filter((item) => item.status === "skip" && item.motivo_skip)
    .reduce((acc, item) => {
      const reason = item.motivo_skip!;
      acc[reason] = (acc[reason] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

  // Get recent errors
  const recentErrors = queue
    ?.filter((item) => item.status === "falha" && item.erro)
    .slice(0, 5);

  const getJobStatusIcon = (status: string) => {
    switch (status) {
      case "concluido":
        return <CheckCircle2 className="w-4 h-4 text-success" />;
      case "parcial":
        return <AlertTriangle className="w-4 h-4 text-warning" />;
      case "erro":
        return <XCircle className="w-4 h-4 text-destructive" />;
      case "processando":
        return <RefreshCw className="w-4 h-4 text-primary animate-spin" />;
      default:
        return <Clock className="w-4 h-4 text-muted-foreground" />;
    }
  };

  return (
    <div className="space-y-6">
      {/* Stats Header */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="glass-card p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <Coins className="w-5 h-5 text-primary" />
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Créditos</p>
            <p className="text-xl font-semibold">
              {stats.creditsUsed}/{stats.creditsLimit}
            </p>
          </div>
        </div>
        <div className="glass-card p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-success/10 flex items-center justify-center">
            <TrendingUp className="w-5 h-5 text-success" />
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Sucesso</p>
            <p className="text-xl font-semibold">{stats.successRate}%</p>
          </div>
        </div>
        <div className="glass-card p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-accent/10 flex items-center justify-center">
            <Activity className="w-5 h-5 text-accent" />
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Jobs Ativos</p>
            <p className="text-xl font-semibold">{stats.activeJobs}</p>
          </div>
        </div>
      </div>

      {/* Queue */}
      <div className="glass-card">
        <div className="p-5 border-b border-border flex items-center justify-between">
          <h3 className="font-semibold text-lg">Fila de Enrichment</h3>
          <Button variant="ghost" size="sm" onClick={() => refetchQueue()}>
            <RefreshCw className="w-4 h-4" />
          </Button>
        </div>
        <div className="p-4">
          {queueLoading ? (
            <div className="text-center text-muted-foreground py-8">
              Carregando...
            </div>
          ) : queue?.filter((q) => q.status === "aguardando").length === 0 ? (
            <div className="text-center py-8">
              <Inbox className="w-12 h-12 mx-auto text-muted-foreground/50 mb-3" />
              <p className="text-muted-foreground">Nenhum lead na fila</p>
            </div>
          ) : (
            <div className="space-y-2">
              {queue
                ?.filter((q) => q.status === "aguardando")
                .slice(0, 10)
                .map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between p-3 bg-secondary/30 rounded-lg"
                  >
                    <div className="flex items-center gap-3">
                      <Clock className="w-4 h-4 text-muted-foreground" />
                      <span className="text-sm">
                        {item.lead?.nome || "Lead sem nome"}
                      </span>
                    </div>
                    <Badge variant="secondary">Prioridade: {item.prioridade}</Badge>
                  </div>
                ))}
            </div>
          )}
        </div>
      </div>

      {/* Jobs and Errors */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Jobs */}
        <div className="glass-card">
          <div className="p-5 border-b border-border">
            <h3 className="font-semibold">Jobs Recentes</h3>
          </div>
          <div className="divide-y divide-border">
            {jobsLoading ? (
              <div className="p-4 text-center text-muted-foreground">
                Carregando...
              </div>
            ) : jobs?.length === 0 ? (
              <div className="p-4 text-center text-muted-foreground">
                Nenhum job registrado
              </div>
            ) : (
              jobs?.slice(0, 8).map((job) => (
                <div key={job.id} className="p-3 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {getJobStatusIcon(job.status)}
                    <span className="text-sm capitalize">{job.tipo}</span>
                    <span className="text-xs text-muted-foreground">
                      - {job.total_leads} lead{job.total_leads !== 1 ? "s" : ""}
                    </span>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {formatDistanceToNow(new Date(job.created_at), {
                      addSuffix: true,
                      locale: ptBR,
                    })}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Skip Reasons and Errors */}
        <div className="space-y-6">
          {/* Skip Reasons */}
          <div className="glass-card">
            <div className="p-5 border-b border-border">
              <h3 className="font-semibold">Top Motivos Skip/Bloqueio</h3>
            </div>
            <div className="p-4">
              {!skipReasons || Object.keys(skipReasons).length === 0 ? (
                <p className="text-center text-muted-foreground text-sm">
                  Nenhum skip registrado
                </p>
              ) : (
                <div className="space-y-2">
                  {Object.entries(skipReasons)
                    .sort((a, b) => b[1] - a[1])
                    .slice(0, 5)
                    .map(([reason, count]) => (
                      <div
                        key={reason}
                        className="flex items-center justify-between p-2 bg-secondary/30 rounded"
                      >
                        <span className="text-sm font-mono">{reason}</span>
                        <Badge variant="secondary">{count}</Badge>
                      </div>
                    ))}
                </div>
              )}
            </div>
          </div>

          {/* Recent Errors */}
          <div className="glass-card">
            <div className="p-5 border-b border-border">
              <h3 className="font-semibold">Erros Recentes</h3>
            </div>
            <div className="p-4">
              {!recentErrors || recentErrors.length === 0 ? (
                <p className="text-center text-muted-foreground text-sm">
                  Nenhum erro registrado
                </p>
              ) : (
                <div className="space-y-2">
                  {recentErrors.map((item) => (
                    <div
                      key={item.id}
                      className="p-2 bg-destructive/10 border border-destructive/20 rounded text-sm"
                    >
                      <p className="text-destructive font-medium truncate">
                        {item.erro}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
