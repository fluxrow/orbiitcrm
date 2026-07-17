import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";

interface HealthRow {
  empresa_id: string;
  empresa_nome: string;
  empresa_slug: string;
  vendedores_total: number;
  vendedores_com_telefone: number;
  distribuicao_ativos: number;
  prospects_total: number;
  prospects_sem_responsavel: number;
  zapi_configurado: boolean;
  zapi_envio_real_liberado: boolean;
}

function StatusPill({ ok, label }: { ok: boolean; label: string }) {
  return (
    <Badge variant={ok ? "secondary" : "destructive"} className="gap-1">
      {ok ? <CheckCircle2 className="w-3 h-3" /> : <AlertTriangle className="w-3 h-3" />}
      {label}
    </Badge>
  );
}

export default function TenantHealthPage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["pe-tenant-health"],
    queryFn: async () => {
      const { data, error } = await (supabase.rpc as any)("pe_tenant_health_report");
      if (error) throw error;
      return (data ?? []) as HealthRow[];
    },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Saúde dos Tenants</h1>
        <p className="text-sm text-muted-foreground">
          Auditoria rápida antes de liberar Z-API: telefone do responsável, fila de distribuição, prospects órfãos e status de envio real.
        </p>
      </div>

      {isLoading && (
        <div className="flex items-center gap-2 text-muted-foreground text-sm">
          <Loader2 className="w-4 h-4 animate-spin" /> Carregando…
        </div>
      )}

      {error && (
        <Card className="p-4 border-destructive/50 text-sm text-destructive">
          {(error as Error).message}
        </Card>
      )}

      <div className="grid gap-3">
        {data?.map((row) => {
          const semTelefone = row.vendedores_com_telefone === 0;
          const semDistribuicao = row.distribuicao_ativos === 0;
          const orfaos = row.prospects_sem_responsavel > 0;
          const hasGap = semTelefone || semDistribuicao || orfaos;

          return (
            <Card key={row.empresa_id} className="p-4 space-y-3">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div>
                  <h2 className="text-base font-semibold text-foreground">{row.empresa_nome}</h2>
                  <p className="text-xs text-muted-foreground font-mono">/{row.empresa_slug}</p>
                </div>
                {hasGap ? (
                  <Badge variant="destructive" className="gap-1">
                    <AlertTriangle className="w-3 h-3" /> Requer atenção
                  </Badge>
                ) : (
                  <Badge variant="secondary" className="gap-1">
                    <CheckCircle2 className="w-3 h-3" /> OK
                  </Badge>
                )}
              </div>

              <div className="flex flex-wrap gap-2">
                <StatusPill
                  ok={!semTelefone}
                  label={`Vendedores c/ telefone: ${row.vendedores_com_telefone}/${row.vendedores_total}`}
                />
                <StatusPill
                  ok={!semDistribuicao}
                  label={`Fila distribuição: ${row.distribuicao_ativos}`}
                />
                <StatusPill
                  ok={!orfaos}
                  label={`Prospects sem responsável: ${row.prospects_sem_responsavel}/${row.prospects_total}`}
                />
                <StatusPill
                  ok={row.zapi_configurado}
                  label={row.zapi_configurado ? "Z-API configurada" : "Z-API não configurada"}
                />
                <Badge variant={row.zapi_envio_real_liberado ? "default" : "outline"}>
                  Envio real: {row.zapi_envio_real_liberado ? "liberado" : "bloqueado"}
                </Badge>
              </div>
            </Card>
          );
        })}
        {data && data.length === 0 && (
          <p className="text-sm text-muted-foreground">Nenhuma empresa encontrada.</p>
        )}
      </div>
    </div>
  );
}
