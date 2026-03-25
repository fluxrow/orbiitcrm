import { AlertTriangle, ExternalLink, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTenant } from "@/contexts/TenantContext";
import { useStripePortal } from "@/hooks/useStripeSubscription";

export function PaymentWarningBanner() {
  const { empresaId, saasStatus, basePath } = useTenant();
  const portal = useStripePortal();

  if (saasStatus !== "past_due" && saasStatus !== "unpaid") return null;

  const isPastDue = saasStatus === "past_due";

  const handleResolve = () => {
    if (!empresaId) return;
    portal.mutate({
      empresaId,
      returnUrl: `${window.location.origin}${basePath}/meu-plano`,
    });
  };

  return (
    <div className="bg-destructive/10 border-b border-destructive/20 px-4 py-2.5 flex items-center justify-center gap-3 text-sm shrink-0">
      <AlertTriangle className="h-4 w-4 text-destructive shrink-0" />
      <span className="text-destructive font-medium">
        {isPastDue
          ? "Há uma pendência de pagamento. Atualize seu método de pagamento para evitar interrupções."
          : "Sua assinatura está com pagamento pendente. Funcionalidades de escrita estão temporariamente desabilitadas."}
      </span>
      <Button
        size="sm"
        variant="destructive"
        className="shrink-0 h-7 text-xs"
        onClick={handleResolve}
        disabled={portal.isPending}
      >
        {portal.isPending ? (
          <Loader2 className="h-3 w-3 animate-spin mr-1" />
        ) : (
          <ExternalLink className="h-3 w-3 mr-1" />
        )}
        Resolver agora
      </Button>
    </div>
  );
}
