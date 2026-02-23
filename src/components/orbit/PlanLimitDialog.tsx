import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Lock, Clock, Ban } from "lucide-react";

export type PlanLimitReason =
  | "PLAN_LIMIT"
  | "FEATURE_DISABLED"
  | "TRIAL_EXPIRED"
  | "SUSPENDED"
  | "NO_PLAN"
  | "DEMO_RATE_LIMIT";

interface PlanLimitDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  reason?: PlanLimitReason;
}

const reasonConfig: Record<PlanLimitReason, { icon: typeof AlertTriangle; title: string; description: string }> = {
  PLAN_LIMIT: {
    icon: AlertTriangle,
    title: "Limite do plano atingido",
    description:
      "Você atingiu o limite mensal do seu plano para esta funcionalidade. Solicite um upgrade para continuar enviando.",
  },
  FEATURE_DISABLED: {
    icon: Lock,
    title: "Funcionalidade não disponível",
    description:
      "Seu plano atual não inclui esta funcionalidade. Solicite um upgrade para desbloqueá-la.",
  },
  TRIAL_EXPIRED: {
    icon: Clock,
    title: "Período de teste expirado",
    description:
      "Seu período de teste terminou. Ative um plano para continuar usando a plataforma.",
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
};

export function PlanLimitDialog({ open, onOpenChange, reason = "PLAN_LIMIT" }: PlanLimitDialogProps) {
  const config = reasonConfig[reason] || reasonConfig.PLAN_LIMIT;
  const Icon = config.icon;

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
          <Button onClick={() => onOpenChange(false)}>
            Solicitar upgrade
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
