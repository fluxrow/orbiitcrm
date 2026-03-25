import { useNavigate } from "react-router-dom";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Lock, Clock, Ban, ArrowUpRight } from "lucide-react";
import { useTenant } from "@/contexts/TenantContext";

export type PlanLimitReason =
  | "PLAN_LIMIT_REACHED"
  | "PLAN_FEATURE_DISABLED"
  | "PLAN_STATUS_BLOCKED"
  | "TRIAL_EXPIRED"
  | "NO_PLAN"
  | "DEMO_RATE_LIMIT"
  | "DEMO_ACTION_BLOCKED"
  // Legacy codes (mapped to new ones in display)
  | "PLAN_LIMIT"
  | "FEATURE_DISABLED"
  | "SUSPENDED";

interface PlanLimitDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  reason?: PlanLimitReason;
}

const reasonConfig: Record<string, { icon: typeof AlertTriangle; title: string; description: string; showUpgrade?: boolean }> = {
  PLAN_LIMIT_REACHED: {
    icon: AlertTriangle,
    title: "Limite do plano atingido",
    description:
      "Você atingiu o limite do seu plano para esta funcionalidade. Faça um upgrade para continuar.",
    showUpgrade: true,
  },
  PLAN_LIMIT: {
    icon: AlertTriangle,
    title: "Limite do plano atingido",
    description:
      "Você atingiu o limite mensal do seu plano para esta funcionalidade. Faça um upgrade para continuar.",
    showUpgrade: true,
  },
  PLAN_FEATURE_DISABLED: {
    icon: Lock,
    title: "Funcionalidade não disponível",
    description:
      "Seu plano atual não inclui esta funcionalidade. Faça um upgrade para desbloqueá-la.",
    showUpgrade: true,
  },
  FEATURE_DISABLED: {
    icon: Lock,
    title: "Funcionalidade não disponível",
    description:
      "Seu plano atual não inclui esta funcionalidade. Faça um upgrade para desbloqueá-la.",
    showUpgrade: true,
  },
  TRIAL_EXPIRED: {
    icon: Clock,
    title: "Período de teste expirado",
    description:
      "Seu período de teste terminou. Ative um plano para continuar usando a plataforma.",
    showUpgrade: true,
  },
  PLAN_STATUS_BLOCKED: {
    icon: Ban,
    title: "Ação bloqueada",
    description:
      "Há uma pendência de pagamento na sua assinatura. Regularize para continuar usando este recurso.",
    showUpgrade: true,
  },
  SUSPENDED: {
    icon: Ban,
    title: "Conta suspensa",
    description:
      "Sua conta está suspensa. Entre em contato com o suporte para mais informações.",
  },
  NO_PLAN: {
    icon: Ban,
    title: "Nenhum plano ativo",
    description:
      "Sua empresa não possui um plano ativo. Entre em contato com o administrador.",
  },
  DEMO_RATE_LIMIT: {
    icon: Clock,
    title: "Limite de mensagens atingido",
    description:
      "Você atingiu o limite de 30 mensagens por hora no modo demo. Aguarde um momento ou solicite um upgrade.",
  },
  DEMO_ACTION_BLOCKED: {
    icon: Lock,
    title: "Ação bloqueada no modo demo",
    description:
      "Esta ação não está disponível no modo demonstração. Solicite um upgrade para desbloquear.",
  },
};

export function PlanLimitDialog({ open, onOpenChange, reason = "PLAN_LIMIT_REACHED" }: PlanLimitDialogProps) {
  const config = reasonConfig[reason] || reasonConfig.PLAN_LIMIT_REACHED;
  const Icon = config.icon;
  const navigate = useNavigate();
  const { basePath } = useTenant();

  const handleGoToPlan = () => {
    onOpenChange(false);
    navigate(`${basePath}/meu-plano`);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-destructive/10">
              <Icon className="h-5 w-5 text-destructive" />
            </div>
            <DialogTitle>{config.title}</DialogTitle>
          </div>
          <DialogDescription className="pt-2">
            {config.description}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Fechar
          </Button>
          {config.showUpgrade && (
            <Button onClick={handleGoToPlan}>
              <ArrowUpRight className="h-4 w-4 mr-1" />
              Ver Meu Plano
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
