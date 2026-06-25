import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Activity, AlertTriangle, CheckCircle2, Clock, RefreshCw, Webhook, Workflow } from "lucide-react";
import { useState } from "react";
import { format } from "date-fns";

interface HealthKpis {
  window_hours: number;
  since: string;
  webhooks: { total: number; errors: number; status_4xx: number; status_5xx: number; success_rate: number | null };
  flow_events: { total: number; processed: number; pending: number };
  flow_runs: { total: number; success: number; failed: number; pending: number; success_rate: number | null; avg_latency_ms: number };
}

interface HealthLogs {
  webhooks: Array<{ id: string; event_type: string | null; instance_id: string | null; phone: string | null; status: string | null; error_message: string | null; created_at: string }>;
  flow_runs: Array<{ id: string; flow_id: string; empresa_id: string; status: string; started_at: string | null; finished_at: string | null; error: string | null; created_at: string; latency_ms: number | null }>;
}

const WINDOWS = [
  { value: 1, label: "Última 1h" },
  { value: 6, label: "Últimas 6h" },
  { value: 24, label: "Últimas 24h" },
  { value: 72, label: "Últimos 3 dias" },
  { value: 168, label: "Últimos 7 dias" },
];

export function SystemHealthTab() {
  const [hours, setHours] = useState(24);

  const kpisQ = useQuery({
    queryKey: ["system-health-kpis", hours],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_system_health_kpis" as any, { p_hours: hours });
      if (error) throw error;
      return data as unknown as HealthKpis;
    },
    refetchInterval: 30_000,
  });

  const logsQ = useQuery({
    queryKey: ["system-health-logs"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_system_health_recent_logs" as any, { p_limit: 50 });
      if (error) throw error;
      return data as unknown as HealthLogs;
    },
    refetchInterval: 30_000,
  });

  const refresh = () => {
    kpisQ.refetch();
    logsQ.refetch();
  };

  const k = kpisQ.data;
  const loading = kpisQ.isLoading || logsQ.isLoading;
  const error = kpisQ.error || logsQ.error;

  return (
    <div className="space-y-6">
      <Card className="glass-card">
        <CardHeader className="flex flex-row items-center justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Activity className="w-5 h-5 text-primary" /> Saúde do Sistema
            </CardTitle>
            <CardDescription>
              Painel exclusivo Super Admin — observabilidade de webhooks, automações e latência das Edge Functions.
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Select value={String(hours)} onValueChange={(v) => setHours(Number(v))}>
              <SelectTrigger className="h-9 w-[160px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                {WINDOWS.map((w) => (
                  <SelectItem key={w.value} value={String(w.value)}>{w.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" onClick={refresh} disabled={loading} className="gap-2">
              <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} /> Atualizar
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {error ? (
            <p className="text-sm text-destructive">Erro ao carregar painel: {String((error as any).message || error)}</p>
          ) : !k ? (
            <p className="text-sm text-muted-foreground">Carregando KPIs…</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <Kpi
                icon={<Webhook className="w-4 h-4" />}
                label="Webhooks recebidos"
                value={k.webhooks.total.toLocaleString("pt-BR")}
                sub={`${k.webhooks.errors} com erro`}
                tone={k.webhooks.errors > 0 ? "warn" : "ok"}
              />
              <Kpi
                icon={<AlertTriangle className="w-4 h-4" />}
                label="Erros HTTP"
                value={`${k.webhooks.status_4xx + k.webhooks.status_5xx}`}
                sub={`4xx: ${k.webhooks.status_4xx} · 5xx: ${k.webhooks.status_5xx}`}
                tone={k.webhooks.status_5xx > 0 ? "bad" : k.webhooks.status_4xx > 0 ? "warn" : "ok"}
              />
              <Kpi
                icon={<CheckCircle2 className="w-4 h-4" />}
                label="Sucesso de automações"
                value={k.flow_runs.success_rate != null ? `${k.flow_runs.success_rate}%` : "—"}
                sub={`${k.flow_runs.success}/${k.flow_runs.total} runs`}
                tone={(k.flow_runs.success_rate ?? 100) >= 95 ? "ok" : (k.flow_runs.success_rate ?? 0) >= 80 ? "warn" : "bad"}
              />
              <Kpi
                icon={<Clock className="w-4 h-4" />}
                label="Latência média"
                value={`${k.flow_runs.avg_latency_ms.toLocaleString("pt-BR")} ms`}
                sub={`Pendentes: ${k.flow_runs.pending} · Falhas: ${k.flow_runs.failed}`}
                tone={k.flow_runs.avg_latency_ms < 1500 ? "ok" : k.flow_runs.avg_latency_ms < 4000 ? "warn" : "bad"}
              />
              <Kpi
                icon={<Workflow className="w-4 h-4" />}
                label="Eventos de fluxo"
                value={k.flow_events.total.toLocaleString("pt-BR")}
                sub={`${k.flow_events.processed} processados · ${k.flow_events.pending} na fila`}
                tone={k.flow_events.pending > 10 ? "warn" : "ok"}
              />
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="glass-card">
        <CardHeader>
          <CardTitle className="text-base">Logs recentes</CardTitle>
          <CardDescription>Últimos 50 registros — atualiza a cada 30s.</CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="webhooks">
            <TabsList>
              <TabsTrigger value="webhooks" className="gap-2"><Webhook className="w-4 h-4" /> Webhooks</TabsTrigger>
              <TabsTrigger value="runs" className="gap-2"><Workflow className="w-4 h-4" /> Execuções</TabsTrigger>
            </TabsList>
            <TabsContent value="webhooks" className="mt-4">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Quando</TableHead>
                    <TableHead>Evento</TableHead>
                    <TableHead>Instância</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Erro</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(logsQ.data?.webhooks || []).length === 0 ? (
                    <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">Sem registros</TableCell></TableRow>
                  ) : (
                    logsQ.data!.webhooks.map((w) => (
                      <TableRow key={w.id}>
                        <TableCell className="text-xs">{format(new Date(w.created_at), "dd/MM HH:mm:ss")}</TableCell>
                        <TableCell className="text-xs">{w.event_type || "—"}</TableCell>
                        <TableCell className="text-xs truncate max-w-[160px]">{w.instance_id || "—"}</TableCell>
                        <TableCell><StatusBadge value={w.status} hasError={!!w.error_message} /></TableCell>
                        <TableCell className="text-xs text-destructive truncate max-w-[260px]">{w.error_message || ""}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </TabsContent>
            <TabsContent value="runs" className="mt-4">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Quando</TableHead>
                    <TableHead>Flow</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Latência</TableHead>
                    <TableHead>Erro</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(logsQ.data?.flow_runs || []).length === 0 ? (
                    <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">Sem registros</TableCell></TableRow>
                  ) : (
                    logsQ.data!.flow_runs.map((r) => (
                      <TableRow key={r.id}>
                        <TableCell className="text-xs">{format(new Date(r.created_at), "dd/MM HH:mm:ss")}</TableCell>
                        <TableCell className="text-xs font-mono truncate max-w-[160px]">{r.flow_id.slice(0, 8)}…</TableCell>
                        <TableCell><StatusBadge value={r.status} hasError={!!r.error} /></TableCell>
                        <TableCell className="text-xs">{r.latency_ms != null ? `${r.latency_ms} ms` : "—"}</TableCell>
                        <TableCell className="text-xs text-destructive truncate max-w-[260px]">{r.error || ""}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}

function Kpi({ icon, label, value, sub, tone }: { icon: React.ReactNode; label: string; value: string; sub?: string; tone: "ok" | "warn" | "bad" }) {
  const toneClass = tone === "ok"
    ? "border-emerald-500/30 bg-emerald-500/5"
    : tone === "warn"
      ? "border-amber-500/30 bg-amber-500/5"
      : "border-destructive/40 bg-destructive/5";
  return (
    <div className={`rounded-lg border p-4 ${toneClass}`}>
      <div className="flex items-center gap-2 text-xs text-muted-foreground">{icon}<span>{label}</span></div>
      <div className="text-2xl font-semibold mt-1">{value}</div>
      {sub && <div className="text-xs text-muted-foreground mt-1">{sub}</div>}
    </div>
  );
}

function StatusBadge({ value, hasError }: { value: string | null; hasError: boolean }) {
  const v = (value || "").toLowerCase();
  const variant: "default" | "secondary" | "destructive" =
    hasError || v.includes("fail") || v.includes("error") || v.startsWith("5") ? "destructive"
    : v === "success" || v === "received" || v === "processed" ? "default"
    : "secondary";
  return <Badge variant={variant} className="text-[10px]">{value || "—"}</Badge>;
}
