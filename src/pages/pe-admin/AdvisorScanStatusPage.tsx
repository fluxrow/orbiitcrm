import { Fragment } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";
import { useState } from "react";
import { Activity, AlertTriangle, CheckCircle2, Clock, RefreshCw, ShieldAlert } from "lucide-react";
import { toast } from "sonner";

type ScanRun = {
  id: string;
  started_at: string;
  finished_at: string | null;
  duration_ms: number | null;
  source: string;
  tenants_total: number;
  tenants_ok: number;
  tenants_error: number;
  suggestions_evaluated: number;
  suggestions_created: number;
  suggestions_blocked: number;
  suggestions_deduped: number;
  detector_metrics: Record<string, {
    detector: string;
    runs: number;
    errors: number;
    duration_ms: number;
    suggestions_raw: number;
    suggestions_blocked: number;
    suggestions_created: number;
    suggestions_deduped: number;
  }>;
  results: any[];
  error: string | null;
};

function useScanRuns() {
  return useQuery<ScanRun[]>({
    queryKey: ["orbit-advisor-scan-runs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orbit_advisor_scan_runs" as any)
        .select("*")
        .order("started_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as unknown as ScanRun[];
    },
    refetchInterval: 30000,
  });
}

function formatDuration(ms: number | null) {
  if (ms == null) return "—";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function Stat({ label, value, icon: Icon, tone = "default" }: { label: string; value: string | number; icon: any; tone?: "default" | "success" | "warn" | "error" }) {
  const toneClass =
    tone === "success" ? "text-success" :
    tone === "warn" ? "text-warning" :
    tone === "error" ? "text-destructive" :
    "text-primary";
  return (
    <div className="glass-card p-4">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs text-muted-foreground mb-1">{label}</p>
          <p className="text-2xl font-bold text-foreground">{value}</p>
        </div>
        <div className={`p-2 rounded-lg bg-primary/10 ${toneClass}`}>
          <Icon className="w-4 h-4" />
        </div>
      </div>
    </div>
  );
}

export default function AdvisorScanStatusPage() {
  const { data: runs, isLoading, refetch, isRefetching } = useScanRuns();
  const [expanded, setExpanded] = useState<string | null>(null);
  const [triggering, setTriggering] = useState(false);

  const last = runs?.[0];

  async function triggerScan() {
    setTriggering(true);
    try {
      const { error } = await supabase.functions.invoke("orbit-advisor-scan", { body: {} });
      if (error) throw error;
      toast.success("Scan disparado");
      setTimeout(() => refetch(), 1500);
    } catch (e: any) {
      toast.error(e?.message ?? "Falha ao disparar scan");
    } finally {
      setTriggering(false);
    }
  }

  const successRate = last && last.tenants_total > 0
    ? Math.round((last.tenants_ok / last.tenants_total) * 100)
    : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Orbit Advisor — Status do Scan</h1>
          <p className="text-sm text-muted-foreground">Métricas dos detectores, execuções recentes e bloqueios por guardrails.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isRefetching}>
            <RefreshCw className={`w-4 h-4 mr-2 ${isRefetching ? "animate-spin" : ""}`} />
            Atualizar
          </Button>
          <Button size="sm" onClick={triggerScan} disabled={triggering}>
            <Activity className={`w-4 h-4 mr-2 ${triggering ? "animate-pulse" : ""}`} />
            Rodar scan agora
          </Button>
        </div>
      </div>

      {/* Snapshot da última execução */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat
          label="Última execução"
          value={last ? format(new Date(last.started_at), "dd/MM HH:mm") : "—"}
          icon={Clock}
        />
        <Stat
          label="Duração"
          value={last ? formatDuration(last.duration_ms) : "—"}
          icon={Activity}
        />
        <Stat
          label="Tenants ok"
          value={last ? `${last.tenants_ok}/${last.tenants_total}${successRate != null ? ` · ${successRate}%` : ""}` : "—"}
          icon={CheckCircle2}
          tone={last && last.tenants_error === 0 ? "success" : "warn"}
        />
        <Stat
          label="Sugestões criadas / bloqueadas"
          value={last ? `${last.suggestions_created} / ${last.suggestions_blocked}` : "—"}
          icon={ShieldAlert}
          tone={last && last.suggestions_blocked > 0 ? "warn" : "default"}
        />
      </div>

      {/* Métricas por detector — última run */}
      <section className="glass-card p-4">
        <h2 className="text-sm font-semibold text-foreground mb-3">Detectores (última execução)</h2>
        {!last ? (
          <p className="text-sm text-muted-foreground">Sem execuções ainda.</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Detector</TableHead>
                  <TableHead className="text-right">Runs</TableHead>
                  <TableHead className="text-right">Erros</TableHead>
                  <TableHead className="text-right">Tempo total</TableHead>
                  <TableHead className="text-right">Tempo médio</TableHead>
                  <TableHead className="text-right">Sugestões</TableHead>
                  <TableHead className="text-right">Bloqueadas</TableHead>
                  <TableHead className="text-right">Dedup</TableHead>
                  <TableHead className="text-right">Criadas</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {Object.values(last.detector_metrics ?? {}).map((m) => (
                  <TableRow key={m.detector}>
                    <TableCell className="font-mono text-xs">{m.detector}</TableCell>
                    <TableCell className="text-right">{m.runs}</TableCell>
                    <TableCell className={`text-right ${m.errors > 0 ? "text-destructive" : ""}`}>{m.errors}</TableCell>
                    <TableCell className="text-right">{formatDuration(m.duration_ms)}</TableCell>
                    <TableCell className="text-right text-muted-foreground">
                      {m.runs > 0 ? formatDuration(Math.round(m.duration_ms / m.runs)) : "—"}
                    </TableCell>
                    <TableCell className="text-right">{m.suggestions_raw}</TableCell>
                    <TableCell className={`text-right ${m.suggestions_blocked > 0 ? "text-warning" : "text-muted-foreground"}`}>
                      {m.suggestions_blocked}
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground">{m.suggestions_deduped}</TableCell>
                    <TableCell className="text-right font-medium">{m.suggestions_created}</TableCell>
                  </TableRow>
                ))}
                {Object.keys(last.detector_metrics ?? {}).length === 0 && (
                  <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground py-4">Sem métricas de detector nesta execução.</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        )}
      </section>

      {/* Bloqueios por advisor_locked_paths — última run */}
      {last && last.suggestions_blocked > 0 && (
        <section className="glass-card p-4">
          <h2 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-warning" />
            Bloqueios por guardrails (advisor_locked_paths)
          </h2>
          <div className="space-y-1 text-sm">
            {last.results
              .filter((r: any) => r?.blocked_by_detector && Object.keys(r.blocked_by_detector).length > 0)
              .map((r: any) => (
                <div key={r.empresa_id} className="flex flex-wrap items-center gap-2 py-1 border-b border-border/50 last:border-0">
                  <code className="text-xs text-muted-foreground">{r.empresa_id.slice(0, 8)}…</code>
                  {Object.entries(r.blocked_by_detector as Record<string, number>).map(([tipo, n]) => (
                    <Badge key={tipo} variant="outline" className="text-warning border-warning/40">
                      {tipo}: {n}
                    </Badge>
                  ))}
                </div>
              ))}
          </div>
        </section>
      )}

      {/* Histórico */}
      <section className="glass-card p-4">
        <h2 className="text-sm font-semibold text-foreground mb-3">Últimas execuções</h2>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Início</TableHead>
                <TableHead>Origem</TableHead>
                <TableHead className="text-right">Duração</TableHead>
                <TableHead className="text-right">Tenants</TableHead>
                <TableHead className="text-right">Avaliadas</TableHead>
                <TableHead className="text-right">Criadas</TableHead>
                <TableHead className="text-right">Bloqueadas</TableHead>
                <TableHead className="text-right">Dedup</TableHead>
                <TableHead>Status</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={10} className="text-center py-6 text-muted-foreground">Carregando…</TableCell></TableRow>
              ) : !runs?.length ? (
                <TableRow><TableCell colSpan={10} className="text-center py-6 text-muted-foreground">Nenhuma execução registrada.</TableCell></TableRow>
              ) : (
                runs.map((r) => (
                  <>
                    <TableRow key={r.id}>
                      <TableCell className="whitespace-nowrap text-muted-foreground text-xs">
                        {format(new Date(r.started_at), "dd/MM/yyyy HH:mm:ss")}
                      </TableCell>
                      <TableCell><Badge variant="outline" className="text-xs">{r.source}</Badge></TableCell>
                      <TableCell className="text-right text-xs">{formatDuration(r.duration_ms)}</TableCell>
                      <TableCell className="text-right text-xs">
                        {r.tenants_ok}/{r.tenants_total}
                        {r.tenants_error > 0 && <span className="text-destructive"> ({r.tenants_error} err)</span>}
                      </TableCell>
                      <TableCell className="text-right text-xs">{r.suggestions_evaluated}</TableCell>
                      <TableCell className="text-right text-xs font-medium">{r.suggestions_created}</TableCell>
                      <TableCell className="text-right text-xs text-warning">{r.suggestions_blocked}</TableCell>
                      <TableCell className="text-right text-xs text-muted-foreground">{r.suggestions_deduped}</TableCell>
                      <TableCell>
                        {r.error ? (
                          <Badge variant="destructive" className="text-xs"><AlertTriangle className="w-3 h-3 mr-1" />erro</Badge>
                        ) : r.tenants_error > 0 ? (
                          <Badge variant="outline" className="text-warning border-warning/40 text-xs">parcial</Badge>
                        ) : (
                          <Badge variant="outline" className="text-success border-success/40 text-xs">ok</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <Button variant="ghost" size="sm" onClick={() => setExpanded(expanded === r.id ? null : r.id)}>
                          {expanded === r.id ? "Fechar" : "Detalhes"}
                        </Button>
                      </TableCell>
                    </TableRow>
                    {expanded === r.id && (
                      <TableRow key={`${r.id}-detail`}>
                        <TableCell colSpan={10} className="bg-muted/20">
                          <div className="p-3 space-y-3">
                            {r.error && (
                              <div className="text-xs text-destructive font-mono">{r.error}</div>
                            )}
                            <div>
                              <p className="text-xs font-semibold text-muted-foreground mb-1">Detectores</p>
                              <pre className="text-[11px] bg-background/50 p-2 rounded overflow-x-auto max-h-56">
{JSON.stringify(r.detector_metrics, null, 2)}
                              </pre>
                            </div>
                            <div>
                              <p className="text-xs font-semibold text-muted-foreground mb-1">Por tenant</p>
                              <pre className="text-[11px] bg-background/50 p-2 rounded overflow-x-auto max-h-64">
{JSON.stringify(r.results, null, 2)}
                              </pre>
                            </div>
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </section>
    </div>
  );
}
