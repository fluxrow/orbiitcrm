import { Activity, RefreshCw, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { TenantOpsHealth } from "@/lib/tenant-operations-types";

interface Props {
  health?: TenantOpsHealth;
  refreshing: boolean;
  onRefresh: () => void;
}

export function TenantOperationsOverview({ health, refreshing, onRefresh }: Props) {
  return (
    <Card className="mb-6 border-primary/20 bg-primary/[0.03]">
      <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="rounded-full bg-emerald-500/10 p-2 text-emerald-500"><Activity className="h-5 w-5" /></div>
          <div>
            <p className="font-semibold">Leitura operacional ativa</p>
            <p className="text-sm text-muted-foreground">
              Dados isolados pelo tenant da sessão. Nenhuma ação de escrita está disponível nesta fase.
            </p>
            <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
              <ShieldCheck className="h-4 w-4" /> RPC tenant-scoped · atualização sob demanda
            </div>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={onRefresh} disabled={refreshing}>
          <RefreshCw className={`mr-2 h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
          Atualizar
        </Button>
      </CardContent>
    </Card>
  );
}
