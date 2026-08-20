import { LockKeyhole } from "lucide-react";
import { OrbitLayout } from "@/components/orbit/OrbitLayout";
import { PageHeader } from "@/components/orbit/PageHeader";
import { TenantOperationsModules, TenantOperationsOverview } from "@/components/orbit/tenant-operations";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useTenantOperationsFeature } from "@/hooks/useTenantOperations";
import { useQueryClient } from "@tanstack/react-query";

export default function TenantOperationsPage() {
  const queryClient = useQueryClient();
  const feature = useTenantOperationsFeature();

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["tenant-operations"] });

  return (
    <OrbitLayout>
      <PageHeader
        title="Centro de Operações"
        description="Monitoramento e ações operacionais controladas do tenant"
      />

      {feature.isLoading ? (
        <div className="h-28 animate-pulse rounded-lg bg-muted" />
      ) : feature.isError ? (
        <Alert variant="destructive">
          <AlertTitle>Centro de Operações indisponível</AlertTitle>
          <AlertDescription>Não foi possível validar a liberação deste módulo.</AlertDescription>
        </Alert>
      ) : !feature.enabled ? (
        <Alert>
          <LockKeyhole className="h-4 w-4" />
          <AlertTitle>Módulo ainda não habilitado</AlertTitle>
          <AlertDescription>
            A feature flag tenant_operations_center_v1 permanece desligada para este tenant.
          </AlertDescription>
        </Alert>
      ) : (
        <>
          <TenantOperationsOverview health={feature.data} refreshing={feature.isFetching} onRefresh={refresh} />
          <TenantOperationsModules />
        </>
      )}
    </OrbitLayout>
  );
}
