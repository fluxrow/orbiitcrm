import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ShieldAlert, Clock, Ban } from "lucide-react";

interface TenantBlockedProps {
  reason: string | null;
  trialEndsAt: string | null;
  empresaNome: string | null;
}

export default function TenantBlocked({ reason, trialEndsAt, empresaNome }: TenantBlockedProps) {
  const isTrialExpired = reason === "trial_expired";
  const isSuspended = reason === "suspended";
  const isUnauthorized = reason === "unauthorized";

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="text-center space-y-4 max-w-md">
        {isTrialExpired ? (
          <Clock className="mx-auto h-16 w-16 text-amber-500" />
        ) : isUnauthorized ? (
          <Ban className="mx-auto h-16 w-16 text-destructive" />
        ) : (
          <ShieldAlert className="mx-auto h-16 w-16 text-destructive" />
        )}

        <h1 className="text-2xl font-bold">
          {isTrialExpired && "Período de teste encerrado"}
          {isSuspended && "Conta suspensa"}
          {isUnauthorized && "Acesso não autorizado"}
          {!isTrialExpired && !isSuspended && !isUnauthorized && "Acesso pausado"}
        </h1>

        {empresaNome && (
          <p className="text-sm text-muted-foreground font-medium">{empresaNome}</p>
        )}

        <p className="text-muted-foreground">
          {isTrialExpired && "Seu período de teste de 7 dias acabou. Para continuar usando o Orbit, entre em contato para ativar seu plano."}
          {isSuspended && "Sua conta foi suspensa. Entre em contato com o suporte para mais informações."}
          {isUnauthorized && "Você não tem permissão para acessar esta empresa."}
          {!isTrialExpired && !isSuspended && !isUnauthorized && "Sua conta não está ativa no momento. Entre em contato com o suporte."}
        </p>

        {isTrialExpired && (
          <Button className="w-full" size="lg">
            Falar com o time comercial
          </Button>
        )}

        <Link to="/auth">
          <Button variant="outline" className="w-full">Voltar ao Login</Button>
        </Link>
      </div>
    </div>
  );
}
