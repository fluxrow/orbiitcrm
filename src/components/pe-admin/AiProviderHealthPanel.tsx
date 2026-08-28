import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, Bot, CheckCircle2, Clock3, DollarSign, Loader2, RefreshCw, Save, ShieldCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

type ProviderStatus = "healthy" | "warning" | "critical" | "depleted" | "degraded" | "unknown";

interface ProviderConfig {
  enabled: boolean;
  warning_days_remaining: number;
  critical_days_remaining: number;
  warning_balance_usd: number;
  critical_balance_usd: number;
  baseline_credit_usd: number | null;
  baseline_recorded_at: string | null;
  alert_email: string;
}

interface ProviderHealth {
  status: ProviderStatus;
  provider_ok: boolean | null;
  admin_api_configured: boolean;
  cost_today_usd: number | null;
  cost_7d_usd: number | null;
  cost_30d_usd: number | null;
  average_daily_cost_7d_usd: number | null;
  estimated_balance_usd: number | null;
  projected_days_remaining: number | null;
  last_checked_at: string | null;
  last_error_code: string | null;
  consecutive_failures: number;
  latency_ms: number | null;
}

interface ProviderAlert {
  id: string;
  severity: "info" | "warning" | "critical";
  status: "open" | "recovered";
  message: string;
  email_sent: boolean;
  email_error: string | null;
  created_at: string;
}

interface ProviderSnapshot {
  config: ProviderConfig;
  health: ProviderHealth;
  recent_alerts: ProviderAlert[];
}

interface FormState {
  enabled: boolean;
  warningDays: string;
  criticalDays: string;
  warningBalance: string;
  criticalBalance: string;
  baselineCredit: string;
  alertEmail: string;
}

const emptyForm: FormState = {
  enabled: true,
  warningDays: "7",
  criticalDays: "3",
  warningBalance: "20",
  criticalBalance: "10",
  baselineCredit: "",
  alertEmail: "fbcfarias@icloud.com",
};

type RpcResult = Promise<{
  data: unknown;
  error: { message: string } | null;
}>;

const callRpc = supabase.rpc as unknown as (
  functionName: string,
  args?: Record<string, unknown>,
) => RpcResult;

function money(value: number | null | undefined): string {
  if (value == null) return "—";
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "USD" }).format(Number(value));
}

function numberValue(value: number | null | undefined, suffix = ""): string {
  if (value == null) return "—";
  return `${Number(value).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}${suffix}`;
}

function statusLabel(status: ProviderStatus): string {
  return ({
    healthy: "Saudável",
    warning: "Atenção",
    critical: "Crítico",
    depleted: "Crédito esgotado",
    degraded: "Monitor degradado",
    unknown: "Ainda não verificado",
  })[status];
}

function statusVariant(status: ProviderStatus): "default" | "secondary" | "destructive" {
  if (["critical", "depleted", "degraded"].includes(status)) return "destructive";
  if (status === "healthy") return "default";
  return "secondary";
}

async function loadSnapshot(): Promise<ProviderSnapshot> {
  const { data, error } = await callRpc("orbit_get_ai_provider_health");
  if (error) throw error;
  return data as ProviderSnapshot;
}

export function AiProviderHealthPanel({ compact = false }: { compact?: boolean }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<FormState>(emptyForm);
  const [baselineTouched, setBaselineTouched] = useState(false);
  const [showSettings, setShowSettings] = useState(!compact);

  const snapshotQ = useQuery({
    queryKey: ["ai-provider-health", "anthropic"],
    queryFn: loadSnapshot,
    refetchInterval: 60_000,
  });

  useEffect(() => {
    const config = snapshotQ.data?.config;
    if (!config) return;
    setForm({
      enabled: config.enabled,
      warningDays: String(config.warning_days_remaining),
      criticalDays: String(config.critical_days_remaining),
      warningBalance: String(config.warning_balance_usd),
      criticalBalance: String(config.critical_balance_usd),
      baselineCredit: config.baseline_credit_usd == null ? "" : String(config.baseline_credit_usd),
      alertEmail: config.alert_email,
    });
  }, [snapshotQ.data?.config]);

  const refreshM = useMutation({
    mutationFn: async () => {
      const result = await supabase.functions.invoke("orbit-ai-provider-health", { body: { action: "refresh" } });
      if (result.error) throw new Error(result.error.message);
      if (result.data?.ok !== true) throw new Error(result.data?.error?.code ?? "Falha ao verificar Anthropic");
      return result.data.data as ProviderSnapshot;
    },
    onSuccess: (data) => {
      queryClient.setQueryData(["ai-provider-health", "anthropic"], data);
      toast({ title: "Anthropic verificada", description: "Custos e saúde foram atualizados com segurança." });
    },
    onError: (error: Error) => toast({ title: "Falha na verificação", description: error.message, variant: "destructive" }),
  });

  const saveM = useMutation({
    mutationFn: async () => {
      const baseline = form.baselineCredit.trim() === "" ? null : Number(form.baselineCredit);
      const args = {
        p_warning_days_remaining: Number(form.warningDays),
        p_critical_days_remaining: Number(form.criticalDays),
        p_warning_balance_usd: Number(form.warningBalance),
        p_critical_balance_usd: Number(form.criticalBalance),
        p_baseline_credit_usd: baseline,
        p_baseline_recorded_at: baseline == null
          ? null
          : !baselineTouched && baseline === Number(snapshotQ.data?.config.baseline_credit_usd)
            ? snapshotQ.data?.config.baseline_recorded_at
            : new Date().toISOString(),
        p_alert_email: form.alertEmail.trim(),
        p_enabled: form.enabled,
        p_clear_baseline: baseline == null,
      };
      if ([args.p_warning_days_remaining, args.p_critical_days_remaining, args.p_warning_balance_usd, args.p_critical_balance_usd]
        .some((value) => !Number.isFinite(value) || value < 0)) {
        throw new Error("Revise os limites: todos devem ser números positivos.");
      }
      if (args.p_warning_days_remaining < args.p_critical_days_remaining || args.p_warning_balance_usd < args.p_critical_balance_usd) {
        throw new Error("O limite de atenção deve ser maior ou igual ao limite crítico.");
      }
      if (!form.alertEmail.includes("@")) throw new Error("Informe um e-mail de alerta válido.");
      if (baseline != null && (!Number.isFinite(baseline) || baseline < 0)) throw new Error("Saldo inicial inválido.");
      const { error } = await callRpc("orbit_update_ai_provider_monitor_config", args);
      if (error) throw error;
    },
    onSuccess: async () => {
      setBaselineTouched(false);
      await queryClient.invalidateQueries({ queryKey: ["ai-provider-health", "anthropic"] });
      toast({ title: "Monitor atualizado", description: "As novas regras de alerta foram salvas." });
    },
    onError: (error: Error) => toast({ title: "Não foi possível salvar", description: error.message, variant: "destructive" }),
  });

  const data = snapshotQ.data;
  const health = data?.health;
  const status = health?.status ?? "unknown";
  const busy = refreshM.isPending || saveM.isPending;

  return (
    <Card className="glass-card">
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div>
          <CardTitle className="flex items-center gap-2">
            <Bot className="h-5 w-5 text-primary" /> Saúde e crédito da Anthropic
          </CardTitle>
          <CardDescription>
            Monitor global, visível somente ao Super Admin. Não usa nem altera configurações dos tenants.
          </CardDescription>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={statusVariant(status)}>{statusLabel(status)}</Badge>
          <Button variant="outline" size="sm" onClick={() => refreshM.mutate()} disabled={busy || snapshotQ.isLoading}>
            {refreshM.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            <span className="ml-2 hidden sm:inline">Verificar agora</span>
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        {snapshotQ.error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Monitor ainda indisponível</AlertTitle>
            <AlertDescription>{(snapshotQ.error as Error).message}</AlertDescription>
          </Alert>
        )}

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Metric icon={<ShieldCheck className="h-4 w-4" />} label="API operacional" value={health?.provider_ok == null ? "—" : health.provider_ok ? "Sim" : "Não"} />
          <Metric icon={<DollarSign className="h-4 w-4" />} label="Saldo estimado" value={money(health?.estimated_balance_usd)} />
          <Metric icon={<Clock3 className="h-4 w-4" />} label="Projeção restante" value={numberValue(health?.projected_days_remaining, " dias")} />
          <Metric icon={<DollarSign className="h-4 w-4" />} label="Custo últimos 7 dias" value={money(health?.cost_7d_usd)} />
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
          <span>Hoje: <strong className="text-foreground">{money(health?.cost_today_usd)}</strong></span>
          <span>30 dias: <strong className="text-foreground">{money(health?.cost_30d_usd)}</strong></span>
          <span>Média diária 7d: <strong className="text-foreground">{money(health?.average_daily_cost_7d_usd)}</strong></span>
          <span>Admin Cost API: <strong className="text-foreground">{health?.admin_api_configured ? "configurada" : "não configurada"}</strong></span>
          <span>Última verificação: <strong className="text-foreground">{health?.last_checked_at ? new Date(health.last_checked_at).toLocaleString("pt-BR") : "—"}</strong></span>
        </div>

        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Saldo estimado, não saldo bancário exato</AlertTitle>
          <AlertDescription>
            A Anthropic não publica uma API de saldo pré-pago exato. O Orbit calcula a estimativa pelo saldo-base informado menos os custos oficiais; a confirmação final continua no Console da Anthropic.
          </AlertDescription>
        </Alert>

        <div className="flex items-center justify-between gap-3 border-t pt-4">
          <div>
            <p className="text-sm font-medium">Alertas e limites</p>
            <p className="text-xs text-muted-foreground">E-mail de plataforma; nenhuma mensagem é enviada pela Z-API dos clientes.</p>
          </div>
          <Button variant="ghost" size="sm" onClick={() => setShowSettings((value) => !value)}>
            {showSettings ? "Ocultar" : "Configurar"}
          </Button>
        </div>

        {showSettings && (
          <div className="space-y-4 rounded-lg border p-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <Label htmlFor="provider-monitor-enabled">Monitor habilitado</Label>
                <p className="text-xs text-muted-foreground">O agendamento automático só será ligado após a homologação.</p>
              </div>
              <Switch id="provider-monitor-enabled" checked={form.enabled} onCheckedChange={(enabled) => setForm((current) => ({ ...current, enabled }))} />
            </div>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              <Field label="E-mail de alerta" value={form.alertEmail} type="email" onChange={(alertEmail) => setForm((current) => ({ ...current, alertEmail }))} />
              <Field label="Saldo atual no Console (USD)" value={form.baselineCredit} type="number" placeholder="Ex.: 100" onChange={(baselineCredit) => {
                setBaselineTouched(true);
                setForm((current) => ({ ...current, baselineCredit }));
              }} />
              <Field label="Atenção abaixo de (USD)" value={form.warningBalance} type="number" onChange={(warningBalance) => setForm((current) => ({ ...current, warningBalance }))} />
              <Field label="Crítico abaixo de (USD)" value={form.criticalBalance} type="number" onChange={(criticalBalance) => setForm((current) => ({ ...current, criticalBalance }))} />
              <Field label="Atenção abaixo de (dias)" value={form.warningDays} type="number" onChange={(warningDays) => setForm((current) => ({ ...current, warningDays }))} />
              <Field label="Crítico abaixo de (dias)" value={form.criticalDays} type="number" onChange={(criticalDays) => setForm((current) => ({ ...current, criticalDays }))} />
            </div>
            <div className="flex justify-end">
              <Button onClick={() => saveM.mutate()} disabled={busy}>
                {saveM.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                Salvar monitor
              </Button>
            </div>
          </div>
        )}

        {(data?.recent_alerts?.length ?? 0) > 0 && (
          <div className="space-y-2 border-t pt-4">
            <p className="text-sm font-medium">Alertas recentes</p>
            {data!.recent_alerts.slice(0, compact ? 3 : 10).map((alert) => (
              <div key={alert.id} className="flex items-start justify-between gap-3 rounded-md border p-3 text-xs">
                <div>
                  <p className="font-medium">{alert.message}</p>
                  <p className="mt-1 text-muted-foreground">{new Date(alert.created_at).toLocaleString("pt-BR")} · e-mail {alert.email_sent ? "enviado" : "não enviado"}</p>
                </div>
                <Badge variant={alert.status === "open" ? "destructive" : "secondary"}>{alert.status === "open" ? "Aberto" : "Recuperado"}</Badge>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Metric({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-lg border bg-muted/20 p-4">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">{icon}{label}</div>
      <div className="mt-2 text-xl font-semibold">{value}</div>
    </div>
  );
}

function Field({ label, value, onChange, type = "text", placeholder }: { label: string; value: string; onChange: (value: string) => void; type?: string; placeholder?: string }) {
  const id = `ai-provider-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} type={type} min={type === "number" ? 0 : undefined} step={type === "number" ? "0.01" : undefined} value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} />
    </div>
  );
}
