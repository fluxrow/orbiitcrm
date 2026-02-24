import { OrbitLayout } from "@/components/orbit/OrbitLayout";
import { PageHeader } from "@/components/orbit/PageHeader";
import { useTenant } from "@/contexts/TenantContext";
import { useSaasEmpresa } from "@/hooks/useSaasPlans";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CreditCard, Calendar, Shield } from "lucide-react";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";

const STATUS_MAP: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  active: { label: "Ativo", variant: "default" },
  trial: { label: "Trial", variant: "outline" },
  expired: { label: "Expirado", variant: "destructive" },
  suspended: { label: "Suspenso", variant: "destructive" },
  pending: { label: "Pendente", variant: "secondary" },
};

export default function MeuPlanoPage() {
  const { empresaId, planCode, saasStatus, trialEndsAt, empresaNome, isDemo } = useTenant();
  const { data: saasEmpresa, isLoading } = useSaasEmpresa(empresaId || undefined);

  const statusInfo = STATUS_MAP[saasStatus || ""] || { label: saasStatus || "—", variant: "secondary" as const };
  const planName = saasEmpresa?.saas_plans?.name || planCode || (isDemo ? "Demo" : "—");

  return (
    <OrbitLayout>
      <PageHeader title="Meu Plano" description="Informações da sua assinatura" />

      {isLoading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
        </div>
      ) : (
        <div className="grid gap-6 md:grid-cols-3 max-w-3xl">
          <Card>
            <CardHeader className="flex flex-row items-center gap-3 pb-2">
              <CreditCard className="w-5 h-5 text-primary" />
              <CardTitle className="text-sm font-medium">Plano</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold text-foreground">{planName}</p>
              {empresaNome && (
                <p className="text-xs text-muted-foreground mt-1">{empresaNome}</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center gap-3 pb-2">
              <Shield className="w-5 h-5 text-primary" />
              <CardTitle className="text-sm font-medium">Status</CardTitle>
            </CardHeader>
            <CardContent>
              <Badge variant={statusInfo.variant} className="text-sm px-3 py-1">
                {statusInfo.label}
              </Badge>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center gap-3 pb-2">
              <Calendar className="w-5 h-5 text-primary" />
              <CardTitle className="text-sm font-medium">Trial</CardTitle>
            </CardHeader>
            <CardContent>
              {trialEndsAt ? (
                <p className="text-lg font-semibold text-foreground">
                  {format(parseISO(trialEndsAt), "dd/MM/yyyy", { locale: ptBR })}
                </p>
              ) : (
                <p className="text-sm text-muted-foreground">Sem período de teste</p>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </OrbitLayout>
  );
}
