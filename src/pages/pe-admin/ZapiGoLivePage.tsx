import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { AlertTriangle, CheckCircle2, XCircle, Loader2, Play } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface EmpresaRow {
  empresa_id: string;
  empresa_nome: string;
  zapi_config_id: string | null;
  instance_id_present: boolean;
  numero_origem: string | null;
  envio_real_liberado: boolean;
  rhythm_enabled: boolean | null;
  daily_limit: number | null;
  max_per_minute: number | null;
  warmup_enabled: boolean | null;
  warmup_start_date: string | null;
  sent_today: number;
  last_block_reason: string | null;
  last_block_at: string | null;
}

const SAFE_MAX_PER_MINUTE = 3;
const SAFE_DAILY_LIMIT = 80;

export default function ZapiGoLivePage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [confirmRow, setConfirmRow] = useState<EmpresaRow | null>(null);
  const [confirmText, setConfirmText] = useState("");
  const [confirmChecked, setConfirmChecked] = useState(false);
  const [smokeRunning, setSmokeRunning] = useState<string | null>(null);
  const [smokeResult, setSmokeResult] = useState<any>(null);

  const { data: rows, isLoading } = useQuery({
    queryKey: ["pe-admin-zapi-go-live"],
    queryFn: async (): Promise<EmpresaRow[]> => {
      const today = new Date().toISOString().slice(0, 10);
      const { data: empresas, error } = await supabase
        .from("orbit_empresas")
        .select("id, nome")
        .order("nome");
      if (error) throw error;

      const results: EmpresaRow[] = [];
      for (const e of empresas ?? []) {
        const [zapi, rhythm, usage, lastBlock] = await Promise.all([
          supabase.from("orbit_zapi_config")
            .select("id, instance_id, numero_origem, envio_real_liberado")
            .eq("empresa_id", e.id).maybeSingle(),
          supabase.from("orbit_whatsapp_sending_config")
            .select("enabled, daily_limit, max_per_minute, warmup_enabled, warmup_start_date")
            .eq("empresa_id", e.id).maybeSingle(),
          supabase.from("orbit_whatsapp_daily_usage")
            .select("sent_count")
            .eq("empresa_id", e.id).eq("usage_date", today).maybeSingle(),
          supabase.from("orbit_zapi_send_audit")
            .select("block_reason, created_at")
            .eq("empresa_id", e.id).eq("blocked", true)
            .order("created_at", { ascending: false }).limit(1).maybeSingle(),
        ]);
        results.push({
          empresa_id: e.id,
          empresa_nome: e.nome ?? "(sem nome)",
          zapi_config_id: (zapi.data as any)?.id ?? null,
          instance_id_present: !!(zapi.data as any)?.instance_id,
          numero_origem: (zapi.data as any)?.numero_origem ?? null,
          envio_real_liberado: (zapi.data as any)?.envio_real_liberado === true,
          rhythm_enabled: (rhythm.data as any)?.enabled ?? null,
          daily_limit: (rhythm.data as any)?.daily_limit ?? null,
          max_per_minute: (rhythm.data as any)?.max_per_minute ?? null,
          warmup_enabled: (rhythm.data as any)?.warmup_enabled ?? null,
          warmup_start_date: (rhythm.data as any)?.warmup_start_date ?? null,
          sent_today: Number((usage.data as any)?.sent_count ?? 0),
          last_block_reason: (lastBlock.data as any)?.block_reason ?? null,
          last_block_at: (lastBlock.data as any)?.created_at ?? null,
        });
      }
      return results;
    },
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ row, next }: { row: EmpresaRow; next: boolean }) => {
      if (!row.zapi_config_id) throw new Error("Sem Z-API config para esta empresa");
      const { error } = await supabase
        .from("orbit_zapi_config")
        .update({ envio_real_liberado: next })
        .eq("id", row.zapi_config_id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pe-admin-zapi-go-live"] });
      toast({ title: "Envio real atualizado." });
      setConfirmRow(null);
      setConfirmText("");
      setConfirmChecked(false);
    },
    onError: (e: any) => toast({ title: "Falha ao atualizar", description: e.message, variant: "destructive" }),
  });

  function canActivate(row: EmpresaRow): { ok: boolean; reason?: string } {
    if (!row.zapi_config_id) return { ok: false, reason: "Sem configuração Z-API" };
    if (!row.instance_id_present) return { ok: false, reason: "Instância Z-API sem credenciais" };
    if (row.rhythm_enabled !== true) return { ok: false, reason: "Controle de ritmo desativado" };
    if (!row.daily_limit || row.daily_limit <= 0) return { ok: false, reason: "daily_limit inválido" };
    if (!row.max_per_minute || row.max_per_minute <= 0) return { ok: false, reason: "max_per_minute inválido" };
    if (row.daily_limit > SAFE_DAILY_LIMIT) return { ok: false, reason: `daily_limit acima do seguro (${SAFE_DAILY_LIMIT})` };
    if (row.max_per_minute > SAFE_MAX_PER_MINUTE) return { ok: false, reason: `max_per_minute acima do seguro (${SAFE_MAX_PER_MINUTE})` };
    return { ok: true };
  }

  async function runSmoke(row: EmpresaRow) {
    setSmokeRunning(row.empresa_id);
    setSmokeResult(null);
    try {
      const resp = await supabase.functions.invoke("orbit-zapi-go-live-smoke", {
        body: { empresa_id: row.empresa_id, mode: "safe" },
      });
      setSmokeResult({ empresa_nome: row.empresa_nome, ...(resp.data ?? { error: resp.error?.message }) });
    } catch (e: any) {
      setSmokeResult({ empresa_nome: row.empresa_nome, error: e.message });
    } finally {
      setSmokeRunning(null);
    }
  }

  const handleToggleRequest = (row: EmpresaRow, next: boolean) => {
    if (!next) {
      // Desativar: confirmação simples
      if (window.confirm(`Desabilitar envio real Z-API para ${row.empresa_nome}?`)) {
        toggleMutation.mutate({ row, next: false });
      }
      return;
    }
    const guard = canActivate(row);
    if (!guard.ok) {
      toast({ title: "Não é possível liberar", description: guard.reason, variant: "destructive" });
      return;
    }
    setConfirmRow(row);
    setConfirmText("");
    setConfirmChecked(false);
  };

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Z-API — Envio Real por Empresa</h1>
        <p className="text-sm text-muted-foreground">
          Somente super admin. Default sempre desligado. Ao liberar, confirme instância, ritmo e autorização do cliente.
        </p>
      </div>

      {isLoading && (
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" /> Carregando empresas…
        </div>
      )}

      <div className="grid gap-4">
        {rows?.map((row) => {
          const guard = canActivate(row);
          return (
            <Card key={row.empresa_id}>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between gap-4">
                  <CardTitle className="text-base">{row.empresa_nome}</CardTitle>
                  <div className="flex items-center gap-3">
                    <Badge variant={row.envio_real_liberado ? "destructive" : "secondary"}>
                      {row.envio_real_liberado ? "ENVIO REAL LIBERADO" : "Bloqueado"}
                    </Badge>
                    <Switch
                      checked={row.envio_real_liberado}
                      onCheckedChange={(next) => handleToggleRequest(row, next)}
                    />
                  </div>
                </div>
              </CardHeader>
              <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <Info label="Z-API config" value={row.zapi_config_id ? "OK" : "—"} ok={!!row.zapi_config_id} />
                <Info label="Instância" value={row.instance_id_present ? "OK" : "faltando"} ok={row.instance_id_present} />
                <Info label="Número origem" value={row.numero_origem ?? "—"} ok={!!row.numero_origem} />
                <Info label="Ritmo enabled" value={String(row.rhythm_enabled ?? "—")} ok={row.rhythm_enabled === true} />
                <Info label="daily_limit" value={String(row.daily_limit ?? "—")} ok={!!row.daily_limit && row.daily_limit <= SAFE_DAILY_LIMIT} />
                <Info label="max/minuto" value={String(row.max_per_minute ?? "—")} ok={!!row.max_per_minute && row.max_per_minute <= SAFE_MAX_PER_MINUTE} />
                <Info label="Warmup" value={row.warmup_enabled ? `desde ${row.warmup_start_date ?? "?"}` : "off"} />
                <Info label="Enviados hoje" value={String(row.sent_today)} />
                <div className="col-span-2 md:col-span-4 border-t pt-2 flex items-center justify-between gap-3">
                  <div className="text-xs text-muted-foreground truncate">
                    {row.last_block_at
                      ? `Último bloqueio: ${row.last_block_reason} • ${new Date(row.last_block_at).toLocaleString()}`
                      : "Sem bloqueios registrados."}
                  </div>
                  <div className="flex items-center gap-2">
                    {!guard.ok && (
                      <span className="text-xs text-amber-600 flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3" /> {guard.reason}
                      </span>
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={smokeRunning === row.empresa_id}
                      onClick={() => runSmoke(row)}
                    >
                      {smokeRunning === row.empresa_id ? (
                        <Loader2 className="w-3 h-3 animate-spin mr-1" />
                      ) : (
                        <Play className="w-3 h-3 mr-1" />
                      )}
                      Rodar smoke
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {smokeResult && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Smoke: {smokeResult.empresa_nome}</CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="text-xs bg-muted p-3 rounded overflow-auto max-h-96">
              {JSON.stringify(smokeResult, null, 2)}
            </pre>
          </CardContent>
        </Card>
      )}

      <Dialog open={!!confirmRow} onOpenChange={(o) => !o && setConfirmRow(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-destructive flex items-center gap-2">
              <AlertTriangle className="w-5 h-5" /> Liberar envio real Z-API
            </DialogTitle>
            <DialogDescription>
              Esta ação permite que a plataforma envie mensagens reais pelo WhatsApp desta empresa.
            </DialogDescription>
          </DialogHeader>

          {confirmRow && (
            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-3 p-3 rounded bg-muted">
                <Info label="Empresa" value={confirmRow.empresa_nome} />
                <Info label="Número" value={confirmRow.numero_origem ?? "—"} />
                <Info label="Ritmo" value={confirmRow.rhythm_enabled ? "on" : "off"} />
                <Info label="max/min" value={String(confirmRow.max_per_minute ?? "—")} />
                <Info label="daily_limit" value={String(confirmRow.daily_limit ?? "—")} />
                <Info label="Enviados hoje" value={String(confirmRow.sent_today)} />
              </div>

              <div>
                <Label>Digite <code>LIBERAR ENVIO REAL</code> para confirmar</Label>
                <Input
                  value={confirmText}
                  onChange={(e) => setConfirmText(e.target.value)}
                  placeholder="LIBERAR ENVIO REAL"
                />
              </div>

              <label className="flex items-start gap-2">
                <Checkbox checked={confirmChecked} onCheckedChange={(v) => setConfirmChecked(!!v)} />
                <span className="text-sm">
                  Confirmo que a campanha foi revisada e que a empresa autorizou o disparo.
                </span>
              </label>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmRow(null)}>Cancelar</Button>
            <Button
              variant="destructive"
              disabled={
                confirmText !== "LIBERAR ENVIO REAL" ||
                !confirmChecked ||
                toggleMutation.isPending
              }
              onClick={() => confirmRow && toggleMutation.mutate({ row: confirmRow, next: true })}
            >
              {toggleMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}
              Liberar envio real
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Info({ label, value, ok }: { label: string; value: string; ok?: boolean }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="flex items-center gap-1 font-medium">
        {ok === true && <CheckCircle2 className="w-3 h-3 text-emerald-500" />}
        {ok === false && <XCircle className="w-3 h-3 text-destructive" />}
        <span className="truncate">{value}</span>
      </div>
    </div>
  );
}
