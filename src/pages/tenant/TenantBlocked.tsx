import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ShieldAlert, Clock, Ban, CreditCard, ExternalLink, Loader2 } from "lucide-react";
import { useStripePortal } from "@/hooks/useStripeSubscription";

interface TenantBlockedProps {
  reason: string | null;
  trialEndsAt: string | null;
  empresaNome: string | null;
  empresaId?: string | null;
  basePath?: string;
}

const REASON_CONFIG: Record<string, { icon: typeof ShieldAlert; title: string; description: string; showPortal?: boolean; showUpgrade?: boolean }> = {
  trial_expired: {
    icon: Clock,
    title: "Período de teste encerrado",
    description: "Seu período de teste de 7 dias acabou. Para continuar usando o Orbit, ative um plano.",
    showUpgrade: true,
  },
  suspended: {
    icon: ShieldAlert,
    title: "Conta suspensa",
    description: "Sua conta foi suspensa. Entre em contato com o suporte para mais informações.",
  },
  canceled: {
    icon: Ban,
    title: "Assinatura cancelada",
    description: "Sua assinatura foi cancelada. Reative seu plano para continuar usando o Orbit.",
    showUpgrade: true,
    showPortal: true,
  },
  expired: {
    icon: Clock,
    title: "Assinatura expirada",
    description: "Sua assinatura expirou. Renove seu plano para continuar.",
    showUpgrade: true,
  },
  unauthorized: {
    icon: Ban,
    title: "Acesso não autorizado",
    description: "Você não tem permissão para acessar esta empresa.",
  },
  inactive: {
    icon: ShieldAlert,
    title: "Acesso pausado",
    description: "Sua conta não está ativa no momento. Entre em contato com o suporte.",
  },
};

export default function TenantBlocked({ reason, trialEndsAt, empresaNome, empresaId, basePath }: TenantBlockedProps) {
  const config = REASON_CONFIG[reason || ""] || REASON_CONFIG.inactive;
  const Icon = config.icon;
  const portal = useStripePortal();

  const handlePortal = () => {
    if (!empresaId) return;
    portal.mutate({
      empresaId,
      returnUrl: window.location.href,
    });
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="text-center space-y-4 max-w-md">
        <Icon className="mx-auto h-16 w-16 text-destructive" />

        <h1 className="text-2xl font-bold">{config.title}</h1>

        {empresaNome && (
          <p className="text-sm text-muted-foreground font-medium">{empresaNome}</p>
        )}

        <p className="text-muted-foreground">{config.description}</p>

        <div className="flex flex-col gap-2 pt-2">
          {config.showPortal && empresaId && (
            <Button
              className="w-full"
              variant="default"
              onClick={handlePortal}
              disabled={portal.isPending}
            >
              {portal.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <CreditCard className="h-4 w-4 mr-2" />
              )}
              Regularizar Pagamento
            </Button>
          )}

          {config.showUpgrade && (
            <Button className="w-full" size="lg" asChild>
              <a href="mailto:suporte@orbiit.com.br?subject=Ativar Plano">
                <ExternalLink className="h-4 w-4 mr-2" />
                Falar com o time comercial
              </a>
            </Button>
          )}

          <Link to="/auth">
            <Button variant="outline" className="w-full">Voltar ao Login</Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
